import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { publicAddress, monitorURL, probeURL } from "../network-monitor.js";
test("network probes reject private, loopback, metadata and credential URLs", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.2",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
    "2001:0db8::1",
    "3fff::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(monitorURL("http://example.com:8080/health").port,"8080");
  assert.equal(publicAddress("1.1.1.1"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  for (const url of [
    "file:///etc/passwd",
    "https://user:secret@example.com/",
    "http://example.com/#secret",
  ])
    assert.throws(() => monitorURL(url));
  await assert.rejects(
    probeURL("https://example.com", {
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
    }),
    /not allowed/,
  );
  await assert.rejects(
    probeURL("https://example.com", {
      resolve: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
    }),
    /not allowed/,
  );
});
function fixture(status, chunks) {
  let calls = 0,
    seen;
  const request = (url, options, onResponse) => {
    calls++;
    seen = options;
    const req = new EventEmitter();
    req.destroy = () => {};
    req.end = () =>
      queueMicrotask(() => {
        const res = new PassThrough();
        res.statusCode = status;
        onResponse(res);
        for (const chunk of chunks) res.write(chunk);
        res.end();
      });
    return req;
  };
  return {
    request,
    get calls() {
      return calls;
    },
    get options() {
      return seen;
    },
  };
}
test("network probes pin validated DNS, bound samples and never follow redirects", async () => {
  const dns = async () => [{ address: "1.1.1.1", family: 4 }];
  const f = fixture(200, [Buffer.alloc(600000), Buffer.alloc(600000)]);
  const result = await probeURL("https://example.com", {
    resolve: dns,
    request: f.request,
  });
  assert.equal(result.ok, true);
  assert.equal(result.bytes, 1048576);
  assert.ok(result.mbps > 0);
  f.options.lookup("example.com", { all: true }, (error, addresses) =>
    assert.deepEqual(addresses, [{ address: "1.1.1.1", family: 4 }]),
  );
  const redirect = fixture(302, []);
  const denied = await probeURL("https://example.com", {
    resolve: dns,
    request: redirect.request,
  });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /redirect not followed/);
  assert.equal(redirect.calls, 1);
  const small = fixture(200, [Buffer.alloc(100)]);
  assert.equal(
    (
      await probeURL("https://example.com", {
        resolve: dns,
        request: small.request,
      })
    ).mbps,
    null,
  );
});
