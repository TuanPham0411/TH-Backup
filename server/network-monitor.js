import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
const blocked = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
])
  blocked.addSubnet(ip, prefix, "ipv4");
const ipv6 = new BlockList();
ipv6.addSubnet("2000::", 3, "ipv6");
const ipv6Blocked = new BlockList();
for (const [ip, prefix] of [
  ["2001:db8::", 32],
  ["2001::", 32],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:2::", 48],
  ["2002::", 16],
  ["3fff::", 20],
])
  ipv6Blocked.addSubnet(ip, prefix, "ipv6");
const lan = new BlockList();
for (const [ip, prefix] of [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
])
  lan.addSubnet(ip, prefix, "ipv4");
export function publicAddress(address) {
  if (isIP(address) === 4) return !blocked.check(address, "ipv4");
  if (isIP(address) === 6)
    return ipv6.check(address, "ipv6") && !ipv6Blocked.check(address, "ipv6");
  return false;
}
export function monitorURL(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(new Error("Invalid URL"), { status: 400 });
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    url.href.length > 1500
  )
    throw Object.assign(
      new Error("Use an HTTP(S) URL without credentials or fragments"),
      { status: 400 },
    );
  return url;
}
export async function probeURL(value, { resolve = lookup, request } = {}) {
  const url = monitorURL(value);
  const started = performance.now();
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let dnsTimer;
  let addresses;
  try {
    addresses = await Promise.race([
      resolve(host, { all: true, verbatim: true }),
      new Promise((_, reject) => {
        dnsTimer = setTimeout(() => reject(new Error("DNS timeout")), 8000);
        dnsTimer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(dnsTimer);
  }
  const explicitlyAllowed = (process.env.MONITOR_ALLOWED_HOSTS || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .includes(host.toLowerCase());
  // Private origins require an explicit host allowlist; metadata/loopback never permitted.
  if (
    !addresses.length ||
    addresses.some(
      (a) =>
        !publicAddress(a.address) &&
        !(
          explicitlyAllowed &&
          isIP(a.address) === 4 &&
          lan.check(a.address, "ipv4")
        ),
    )
  )
    throw Object.assign(new Error("Destination is not allowed"), {
      status: 400,
    });
  const selected = addresses[0];
  return new Promise((resolveResult) => {
    let finished = false,
      bytes = 0,
      latency = null,
      status = null,
      response;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      response?.destroy();
      req.destroy();
      const elapsed = performance.now() - started;
      resolveResult({
        ok: !error && status >= 200 && status < 300,
        latency_ms: latency,
        mbps:
          !error && bytes >= 16384
            ? (bytes * 8) / Math.max(1, elapsed) / 1000
            : null,
        bytes,
        status,
        error:
          error || (!(status >= 200 && status < 300) ? `HTTP ${status}` : null),
      });
    };
    const req = (
      request || (url.protocol === "https:" ? https.request : http.request)
    )(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "TH-MES-Monitor/1.0",
          Range: "bytes=0-1048575",
          "Accept-Encoding": "identity",
        },
        lookup: (_host, options, callback) =>
          options.all
            ? callback(null, [selected])
            : callback(null, selected.address, selected.family),
        rejectUnauthorized: true,
      },
      (res) => {
        response = res;
        latency = performance.now() - started;
        status = res.statusCode;
        if (status < 200 || status >= 300) {
          finish(
            `HTTP ${status}${status >= 300 && status < 400 ? " (redirect not followed)" : ""}`,
          );
          return;
        }
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes >= 1048576) {
            bytes = 1048576;
            finish(null);
          }
        });
        res.on("end", () => finish(null));
        res.on("error", () => finish("Response interrupted"));
      },
    );
    const deadline = setTimeout(() => finish("Timeout after 8 seconds"), 8000);
    req.on("error", (error) =>
      finish(
        [
          "ENOTFOUND",
          "ECONNREFUSED",
          "ETIMEDOUT",
          "CERT_HAS_EXPIRED",
          "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        ].includes(error.code)
          ? error.code
          : "Connection failed",
      ),
    );
    req.end();
  });
}
export async function runProbe(pool, target) {
  let result;
  try {
    result = await probeURL(target.data.url);
  } catch {
    result = {
      ok: false,
      latency_ms: null,
      mbps: null,
      bytes: 0,
      status: null,
      error: "DNS or destination unavailable",
    };
  }
  await pool.query(
    "insert into public.mes_probes(target_id,ok,latency_ms,mbps,bytes,status,error) values($1,$2,$3,$4,$5,$6,$7)",
    [
      target.id,
      result.ok,
      result.latency_ms,
      result.mbps,
      result.bytes,
      result.status,
      result.error,
    ],
  );
  return result;
}
export function startMonitor(pool) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { rows } = await pool.query(
        "select id,data from public.mes_workspace where kind='networkTargets' and data->>'active'='true' order by id limit 5",
      );
      for (const target of rows) await runProbe(pool, target);
      await pool.query(
        "delete from public.mes_probes where checked_at<now()-interval '7 days'",
      );
    } catch (error) {
      console.error("Network monitor unavailable", {
        code: error.code || "internal",
      });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 300000);
  timer.unref();
  const first = setTimeout(tick, 10000);
  first.unref();
  return () => {
    clearInterval(timer);
    clearTimeout(first);
  };
}
