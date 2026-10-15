import { createHmac, timingSafeEqual, createHash } from "node:crypto";
export const OWNER_EMAIL = "eric.scorp93@gmail.com";
export const STATUSES = [
  "New",
  "Acknowledged",
  "In progress",
  "Awaiting information",
  "Resolved",
  "Closed",
];
export const PRIORITIES = ["Low", "Medium", "High", "Critical"];
export const TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
export function validUsername(v) {
  return (
    typeof v === "string" &&
    /^[a-z0-9][a-z0-9._-]{0,63}$/.test(v) &&
    !v.includes("..")
  );
}
export function canonicalProof({ challengeId, nonce, username, deviceId }) {
  return `${challengeId}\n${nonce}\n${username}\n${deviceId}`;
}
export function verifyProof(data, secret) {
  if (!/^[a-f0-9]{64}$/.test(data.signature || "")) return false;
  const expected = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(canonicalProof(data))
    .digest();
  return timingSafeEqual(expected, Buffer.from(data.signature, "hex"));
}
export function activeSession(token, user, requiresWindows, now = Date.now()) {
  if (!user?.active) return false;
  if (!requiresWindows) return true;
  return (
    token?.windowsUsername === user.username &&
    typeof token.windowsVerifiedAt === "number" &&
    token.windowsVerifiedAt <= now &&
    now - token.windowsVerifiedAt < 12 * 60 * 60 * 1000
  );
}

export function challengeMatches(challenge, proof, now = Date.now()) {
  const expires =
    typeof challenge?.expiresAt === "number"
      ? challenge.expiresAt
      : challenge?.expiresAt?.toMillis?.();
  return (
    !!challenge &&
    !challenge.used &&
    expires > now &&
    challenge.username === proof.username &&
    challenge.nonceHash ===
      createHash("sha256").update(proof.nonce).digest("hex")
  );
}
