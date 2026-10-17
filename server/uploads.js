import { Router } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, rm, link, truncate } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { join } from "node:path";
import { actorFor, validPath } from "./security.js";
export const VIDEO_LIMIT = 200 * 1024 * 1024,
  CHUNK_LIMIT = 4 * 1024 * 1024;
const types = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const fail = (status, message) =>
  Object.assign(new Error(message), { status, expose: true });
export function uploadRouter(pool, root) {
  const router = Router();
  const actor = (req) =>
    actorFor(req.cookies.th_mes, req.headers["x-mes-tester"]);
  async function dispatch(db, name, data, identity) {
    const {
      rows: [r],
    } = await db.query("select public.mes_dispatch($1,$2,$3) result", [
      name,
      data,
      identity,
    ]);
    return r.result;
  }
  async function authorize(db, req, record) {
    const identity = actor(req);
    if (!identity.session) throw fail(401, "Sign in first");
    const session = await dispatch(db, "getSession", {}, identity);
    if (record?.owner_uid && record.owner_uid !== session.user.uid)
      throw fail(403, "Not your upload");
    if (record?.kind === "ticket")
      await dispatch(db, "uploadUrl", { path: record.path }, identity);
    if (record?.kind === "media") {
      if (!session.isOwner) throw fail(403, "Administrator required");
      const { rowCount } = await db.query(
        "select 1 from public.mes_media where id=$1",
        [record.path],
      );
      if (!rowCount) throw fail(404, "Media unavailable");
    }
    return session;
  }
  router.post("/", async (req, res) => {
    const { kind, path, type, size } = req.body || {};
    if (
      !["ticket", "media"].includes(kind) ||
      typeof path !== "string" ||
      (kind === "ticket" ? !validPath(path) : !/^[a-f0-9-]{36}$/.test(path)) ||
      !types.has(type) ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > (type.startsWith("video/") ? VIDEO_LIMIT : 10485760)
    )
      throw fail(
        400,
        "Invalid upload. Videos: maximum 200 MB; other files: 10 MB.",
      );
    const record = { kind, path, type, size };
    const session = await authorize(pool, req, record);
    record.owner_uid = session.user.uid;
    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("select pg_advisory_xact_lock(74529082)");
      const {
        rows: [previous],
      } = await db.query(
        "select * from public.mes_uploads where kind=$1 and path=$2 for update",
        [kind, path],
      );
      if (previous) {
        if (previous.owner_uid !== record.owner_uid)
          throw fail(403, "Not your upload");
        if (Number(previous.size) !== size || previous.type !== type)
          throw fail(409, "Upload does not match the existing file");
        if (new Date(previous.expires) < new Date())
          throw fail(410, "Upload expired. Please use a new file slot.");
        await db.query("commit");
        return res.json({
          id: previous.id,
          offset: Number(previous.offset_bytes),
          complete: previous.complete,
          chunkSize: CHUNK_LIMIT,
        });
      }
      if (kind === "media") {
        const {
          rows: [media],
        } = await db.query(
          "select * from public.mes_media where id=$1 and not ready for update",
          [path],
        );
        if (!media || Number(media.size) !== size || media.type !== type)
          throw fail(400, "Media reservation differs");
      } else {
        const {
          rows: [quota],
        } = await db.query(
          "select (select coalesce(sum(size),0) from public.files)+(select coalesce(sum(size),0) from public.mes_media)+(select coalesce(sum(size),0) from public.mes_uploads where kind='ticket' and not complete and expires>now()) used",
        );
        if (Number(quota.used) + size > 2147483648)
          throw fail(507, "Storage quota reached");
      }
      const id = randomUUID();
      await db.query(
        "insert into public.mes_uploads(id,kind,path,owner_uid,type,size) values($1,$2,$3,$4,$5,$6)",
        [id, kind, path, record.owner_uid, type, size],
      );
      await db.query("commit");
      res.json({ id, offset: 0, complete: false, chunkSize: CHUNK_LIMIT });
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  });
  const active = new Set();
  router.all("/:id", async (req, res) => {
    if (!["GET", "PATCH"].includes(req.method)) return res.sendStatus(405);
    if (!/^[a-f0-9-]{36}$/.test(req.params.id)) return res.sendStatus(404);
    const {
      rows: [initial],
    } = await pool.query(
      "select * from public.mes_uploads where id=$1 and expires>now()",
      [req.params.id],
    );
    if (!initial) throw fail(410, "Upload expired or unavailable");
    await authorize(pool, req, initial);
    if (req.method === "GET")
      return res.json({
        offset: Number(initial.offset_bytes),
        size: Number(initial.size),
        complete: initial.complete,
      });
    if (active.has(initial.id))
      return res
        .status(409)
        .json({
          error: "Chunk already in progress",
          offset: Number(initial.offset_bytes),
        });
    active.add(initial.id);
    let temporary,
      originalOffset,
      linked,
      wrote = false,
      db;
    try {
      const {
        rows: [record],
      } = await pool.query("select * from public.mes_uploads where id=$1", [
        initial.id,
      ]);
      const current = Number(record.offset_bytes);
      originalOffset = current;
      if (record.complete) return res.json({ offset: current, complete: true });
      if (
        !/^\d+$/.test(req.headers["upload-offset"] || "") ||
        Number(req.headers["upload-offset"]) !== current
      )
        return res
          .status(409)
          .json({ error: "Upload offset differs", offset: current });
      if (req.headers["content-type"] !== "application/octet-stream")
        throw fail(400, "Use binary chunks");
      await mkdir(join(root, ".uploads"), { recursive: true });
      temporary = join(root, ".uploads", record.id + ".part");
      let received = 0;
      const limiter = new Transform({
        transform(chunk, encoding, callback) {
          received += chunk.length;
          callback(
            received > CHUNK_LIMIT || current + received > Number(record.size)
              ? fail(413, "Chunk exceeds upload limits")
              : null,
            chunk,
          );
        },
      });
      wrote = true;
      await pipeline(
        req,
        limiter,
        createWriteStream(temporary, {
          flags: current ? "r+" : "w",
          start: current,
          mode: 0o600,
        }),
      );
      if (!received) throw fail(400, "Empty chunk");
      const next = current + received,
        complete = next === Number(record.size);
      // Never hold a database connection while the client streams a chunk.
      db = await pool.connect();
      await db.query("begin");
      const {
        rows: [locked],
      } = await db.query(
        "select * from public.mes_uploads where id=$1 for update",
        [record.id],
      );
      if (!locked || Number(locked.offset_bytes) !== current)
        throw fail(409, "Upload state changed");
      await authorize(db, req, record);
      if (complete) {
        const destination =
          record.kind === "ticket"
            ? join(root, record.path)
            : join(root, "media", record.path);
        await mkdir(join(destination, ".."), { recursive: true });
        await link(temporary, destination);
        linked = destination;
        if (record.kind === "ticket")
          await db.query(
            "insert into public.files(path,type,size) values($1,$2,$3)",
            [record.path, record.type, record.size],
          );
        else
          await db.query("update public.mes_media set ready=true where id=$1", [
            record.path,
          ]);
      }
      await db.query(
        "update public.mes_uploads set offset_bytes=$2,complete=$3,expires=now()+interval '2 hours' where id=$1",
        [record.id, next, complete],
      );
      await db.query("commit");
      linked = undefined;
      wrote = false;
      if (complete) await rm(temporary, { force: true }).catch(() => {});
      res.json({ offset: next, complete });
    } catch (error) {
      if (db) await db.query("rollback");
      if (linked) await rm(linked, { force: true });
      if (wrote && temporary)
        await truncate(temporary, originalOffset).catch(() => {});
      throw error;
    } finally {
      db?.release();
      active.delete(initial.id);
    }
  });
  return router;
}
export async function cleanupUploads(pool, root) {
  const { rows } = await pool.query(
    "delete from public.mes_uploads where expires<now() returning id",
  );
  for (const row of rows)
    await rm(join(root, ".uploads", row.id + ".part"), { force: true });
  await pool.query(
    "delete from public.mes_media where not ready and created_at<now()-interval '1 day' and not exists(select 1 from public.mes_uploads u where u.kind='media' and u.path=mes_media.id)",
  );
}
