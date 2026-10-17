import { Router } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, rm, link } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { actorFor, hash, token } from "./security.js";
import { monitorURL, runProbe } from "./network-monitor.js";
const fail = (status, message) =>
  Object.assign(new Error(message), { status, expose: true });
const videoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
export function workspaceRouter(pool, filesRoot) {
  const router = Router();
  async function session(actor, owner = false) {
    if (!actor.session) throw fail(401, "Sign in first");
    const {
      rows: [row],
    } = await pool.query("select public.mes_dispatch($1,$2,$3) result", [
      "getSession",
      {},
      actor,
    ]);
    if (owner && !row.result.isOwner) throw fail(403, "Administrator required");
    return row.result;
  }
  const actor = (req) =>
    actorFor(req.cookies.th_mes, req.headers["x-mes-tester"]);
  router.get("/media/:id", async (req, res) => {
    await session(actor(req));
    if (!/^[a-f0-9-]{36}$/.test(req.params.id)) return res.sendStatus(404);
    const {
      rows: [media],
    } = await pool.query(
      "select * from public.mes_media where id=$1 and ready",
      [req.params.id],
    );
    if (!media) return res.sendStatus(404);
    res.set({
      "Content-Type": media.type,
      "Cache-Control": "private, no-store",
    });
    res.sendFile(join(filesRoot, "media", media.id), { dotfiles: "deny" });
  });
  router.put("/media-upload/:grant", async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.grant)) return res.sendStatus(404);
    const {
      rows: [grant],
    } = await pool.query(
      "delete from public.file_grants where hash=$1 and action='workspaceVideo' and expires>now() returning *",
      [hash(req.params.grant)],
    );
    if (!grant) return res.sendStatus(403);
    await session(grant.actor, true);
    const {
      rows: [media],
    } = await pool.query(
      "select * from public.mes_media where id=$1 and not ready",
      [grant.path],
    );
    if (!media) return res.sendStatus(404);
    if (req.headers["content-type"] !== media.type)
      throw fail(400, "Invalid media type");
    await mkdir(join(filesRoot, "media"), { recursive: true });
    const path = join(filesRoot, "media", media.id),
      temporary = path + "." + token() + ".tmp";
    let size = 0;
    try {
      const limiter = new Transform({
        transform(chunk, encoding, callback) {
          size += chunk.length;
          callback(
            size > Number(media.size)
              ? fail(413, "Video exceeds declared size")
              : null,
            chunk,
          );
        },
      });
      await pipeline(
        req,
        limiter,
        createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
      );
      if (size !== Number(media.size)) throw fail(400, "Video incomplete");
      await link(temporary, path);
      try {
        await pool.query("update public.mes_media set ready=true where id=$1", [
          media.id,
        ]);
      } catch (error) {
        await rm(path, { force: true });
        throw error;
      }
      res.json({ ok: true });
    } finally {
      await rm(temporary, { force: true });
    }
  });
  router.post("/workspace", async (req, res) => {
    const { action, data = {} } = req.body || {};
    if (
      typeof action !== "string" ||
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    )
      throw fail(400, "Invalid request");
    const current = await session(actor(req), action !== "read");
    if (action === "read") {
      const { rows } = await pool.query(
        "select kind,id,data from public.mes_workspace order by coalesce(data->>'updatedAt','0') desc,id",
      );
      const { rows: videos } = await pool.query(
        "select id,title,type,size from public.mes_media where ready order by created_at,id",
      );
      const { rows: probes } = await pool.query(
        "select p.* from public.mes_probes p join (select target_id,array_agg(id order by checked_at desc) ids from public.mes_probes where checked_at>now()-interval '24 hours' group by target_id) s on p.id=any(s.ids[1:288]) order by checked_at desc",
      );
      return res.json({
        announcements: rows
          .filter(
            (r) =>
              r.kind === "announcements" && (current.isOwner || r.data.active),
          )
          .map((r) => ({ id: r.id, ...r.data })),
        issueTypes: rows
          .filter((r) => r.kind === "issueTypes")
          .map((r) => ({ id: r.id, ...r.data })),
        targets: rows
          .filter((r) => r.kind === "networkTargets")
          .map((r) => ({
            id: r.id,
            ...r.data,
            probes: probes.filter((p) => p.target_id === r.id),
          })),
        videos,
      });
    }
    if (action === "save") {
      const { kind, id = randomUUID() } = data;
      if (
        !["announcements", "issueTypes", "networkTargets"].includes(kind) ||
        typeof id !== "string" ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(id)
      )
        throw fail(400, "Invalid item");
      if (data.active !== undefined && typeof data.active !== "boolean")
        throw fail(400, "Invalid publication state");
      const value = { active: data.active !== false, updatedAt: Date.now() };
      if (kind === "announcements") {
        if (
          typeof data.title !== "string" ||
          !data.title.trim() ||
          data.title.length > 140 ||
          typeof data.body !== "string" ||
          !data.body.trim() ||
          data.body.length > 3000
        )
          throw fail(400, "Invalid announcement");
        Object.assign(value, {
          title: data.title.trim(),
          body: data.body.trim(),
          pinned: data.pinned === true,
          author: current.user.displayName,
        });
      } else {
        if (
          typeof data.name !== "string" ||
          !data.name.trim() ||
          data.name.length > 80
        )
          throw fail(400, "Invalid name");
        value.name = data.name.trim();
        if (kind === "networkTargets") value.url = monitorURL(data.url).href;
      }
      const max =
        kind === "networkTargets" ? 5 : kind === "issueTypes" ? 50 : 30;
      const result = await pool.query(
        "insert into public.mes_workspace(kind,id,data) select $1,$2,$3 where exists(select 1 from public.mes_workspace where kind=$1 and id=$2) or (select count(*) from public.mes_workspace where kind=$1)<$4 on conflict(kind,id) do update set data=excluded.data returning id",
        [kind, id, value, max],
      );
      if (!result.rowCount) throw fail(400, "Workspace limit reached");
      return res.json({ id });
    }
    if (action === "delete") {
      if (
        !["announcements", "issueTypes", "networkTargets"].includes(
          data.kind,
        ) ||
        typeof data.id !== "string"
      )
        throw fail(400, "Invalid item");
      if (data.kind === "issueTypes" && data.id === "general")
        throw fail(400, "General is retained for older clients");
      await pool.query(
        "delete from public.mes_workspace where kind=$1 and id=$2",
        [data.kind, data.id],
      );
      if (data.kind === "networkTargets")
        await pool.query("delete from public.mes_probes where target_id=$1", [
          data.id,
        ]);
      return res.json({ ok: true });
    }
    if (action === "videoUpload") {
      if (
        !videoTypes.has(data.type) ||
        typeof data.title !== "string" ||
        !data.title.trim() ||
        data.title.length > 140 ||
        !Number.isInteger(data.size) ||
        data.size < 1 ||
        data.size > 50 * 1024 * 1024
      )
        throw fail(400, "Invalid video");
      await pool.query(
        "delete from public.mes_media where not ready and created_at<now()-interval '1 hour'",
      );
      const id = randomUUID();
      const created = await pool.query(
        "insert into public.mes_media(id,title,type,size) select $1,$2,$3,$4::bigint where (select count(*) from public.mes_media)<20 and (select coalesce(sum(size),0) from public.mes_media)+(select coalesce(sum(size),0) from public.files)+$4::bigint<=2147483648 returning id",
        [id, data.title.trim(), data.type, data.size],
      );
      if (!created.rowCount)
        throw fail(400, "Video count or storage quota reached");
      const grant = token();
      await pool.query(
        "insert into public.file_grants(hash,action,path,actor,expires) values($1,'workspaceVideo',$2,$3,now()+interval '5 minutes')",
        [hash(grant), id, actor(req)],
      );
      return res.json({ id, url: `/api/mes/media-upload/${grant}` });
    }
    if (action === "videoUpdate") {
      if (
        typeof data.title !== "string" ||
        !data.title.trim() ||
        data.title.length > 140
      )
        throw fail(400, "Invalid title");
      await pool.query("update public.mes_media set title=$2 where id=$1", [
        data.id,
        data.title.trim(),
      ]);
      return res.json({ ok: true });
    }
    if (action === "videoDelete") {
      const {
        rows: [row],
      } = await pool.query(
        "delete from public.mes_media where id=$1 returning id",
        [data.id],
      );
      if (row) await rm(join(filesRoot, "media", row.id), { force: true });
      return res.json({ ok: true });
    }
    if (action === "probe") {
      const {
        rows: [target],
      } = await pool.query(
        "select id,data from public.mes_workspace where kind='networkTargets' and id=$1 and data->>'active'='true'",
        [data.id],
      );
      if (!target) throw fail(404, "Target unavailable");
      // Persisted cooldown applies across sessions and process restarts.
      const {
        rows: [claim],
      } = await pool.query(
        "update public.mes_workspace set data=jsonb_set(data,'{lastManual}',to_jsonb($2::bigint)) where kind='networkTargets' and id=$1 and coalesce((data->>'lastManual')::bigint,0)<$2::bigint-60000 returning id",
        [target.id, Date.now()],
      );
      if (!claim) throw fail(429, "Wait 60 seconds between manual probes");
      return res.json(await runProbe(pool, target));
    }
    if (action === "probeLog") {
      const { rows } = await pool.query(
        "select * from public.mes_probes where target_id=$1 order by checked_at desc limit 3000",
        [data.id],
      );
      return res.json({ rows });
    }
    throw fail(400, "Unknown workspace action");
  });
  return router;
}
