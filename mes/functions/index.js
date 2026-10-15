import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  isOwner,
  validUsername,
  verifyProof,
  activeSession,
  challengeMatches,
  STATUSES,
  PRIORITIES,
  TYPES,
} from "./policy.js";
initializeApp();
setGlobalOptions({ region: "asia-southeast1", maxInstances: 10 });
const db = getFirestore(),
  auth = getAuth(),
  bucket = getStorage().bucket("th-mes-web.firebasestorage.app");
const options = {
  cors: [
    /^https:\/\/mes\.th\.io\.vn$/,
    /^https:\/\/[a-z0-9-]+\.netlify\.app$/,
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  ],
};
const now = () => FieldValue.serverTimestamp();
function text(value, max, name, min = 1) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new HttpsError("invalid-argument", `Invalid ${name}.`);
  return value.trim();
}
function id(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new HttpsError("invalid-argument", "Invalid identifier.");
  return value;
}
function owner(request) {
  if (!isOwner(request.auth?.token))
    throw new HttpsError(
      "permission-denied",
      "Only the registered Google owner can do this.",
    );
}
async function policy() {
  const p = await db.doc("settings/policy").get();
  return { requiresWindows: p.data()?.requiresWindows !== false };
}
async function member(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (isOwner(request.auth.token))
    return {
      uid: request.auth.uid,
      username: "hpham",
      displayName: request.auth.token.name || "MES Owner",
      owner: true,
    };
  const snap = await db.doc(`users/${request.auth.uid}`).get(),
    user = snap.data(),
    p = await policy();
  const device =
    p.requiresWindows && request.auth.token.mesDevice
      ? await db.doc(`devices/${id(request.auth.token.mesDevice)}`).get()
      : null;
  if (
    (p.requiresWindows && !device?.data()?.active) ||
    !activeSession(request.auth.token, user, p.requiresWindows)
  )
    throw new HttpsError(
      "permission-denied",
      "Your user is inactive or Windows verification has expired. Verify this computer again.",
    );
  return { ...user, uid: request.auth.uid, owner: false };
}
function event(issueRef, who, kind, message, extra = {}) {
  return {
    ref: issueRef.collection("timeline").doc(),
    data: {
      kind,
      text: message,
      authorUid: who.uid,
      author: who.displayName || "MES Owner",
      createdAt: now(),
      ...extra,
    },
  };
}
export const getDirectory = onCall(options, async () => {
  const users = await db.collection("users").where("active", "==", true).get();
  return {
    users: users.docs.map((d) => ({
      id: d.id,
      username: d.data().username,
      displayName: d.data().displayName,
      active: true,
    })),
    ...(await policy()),
  };
});
export const getSession = onCall(options, async (request) => {
  const user = await member(request);
  return {
    user,
    isOwner: user.owner,
    requiresWindows: (await policy()).requiresWindows,
  };
});
export const startWindowsChallenge = onCall(options, async (request) => {
  const username = text(request.data?.username, 64, "username").toLowerCase();
  if (!validUsername(username))
    throw new HttpsError("invalid-argument", "Invalid username.");
  const key = await db.doc(`usernames/${username}`).get();
  if (!key.exists) throw new HttpsError("not-found", "User not found.");
  const user = await db.doc(`users/${key.data().uid}`).get();
  if (!user.data()?.active)
    throw new HttpsError("permission-denied", "This user is inactive.");
  const nonce = randomBytes(32).toString("hex"),
    ref = db.collection("challenges").doc();
  await db.runTransaction(async (tx) => {
    const rateRef = db.doc(`challengeRates/${user.id}`),
      rate = await tx.get(rateRef);
    if (
      rate.exists &&
      Date.now() - (rate.data().lastAt?.toMillis() || 0) < 3000
    )
      throw new HttpsError(
        "resource-exhausted",
        "Wait a moment before retrying.",
      );
    tx.set(rateRef, { lastAt: now() });
    tx.create(ref, {
      uid: user.id,
      username,
      nonceHash: createHash("sha256").update(nonce).digest("hex"),
      expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
      used: false,
    });
  });
  return { challengeId: ref.id, nonce, username };
});
export const completeWindowsChallenge = onCall(options, async (request) => {
  const d = request.data || {};
  id(d.challengeId);
  id(d.deviceId);
  if (!validUsername(d.username) || !/^[a-f0-9]{64}$/.test(d.nonce || ""))
    throw new HttpsError("invalid-argument", "Invalid verification proof.");
  const device = await db.doc(`devices/${d.deviceId}`).get();
  if (!device.data()?.active || !verifyProof(d, device.data().secret))
    throw new HttpsError(
      "permission-denied",
      "Invalid or revoked device proof.",
    );
  const uid = await db.runTransaction(async (tx) => {
    const ref = db.doc(`challenges/${d.challengeId}`),
      snap = await tx.get(ref),
      c = snap.data();
    if (!challengeMatches(c, d))
      throw new HttpsError(
        "permission-denied",
        "Challenge expired or already used.",
      );
    const user = await tx.get(db.doc(`users/${c.uid}`));
    if (!user.data()?.active || user.data().username !== d.username)
      throw new HttpsError(
        "permission-denied",
        "The selected user is no longer active.",
      );
    tx.update(ref, { used: true, usedAt: now(), deviceId: d.deviceId });
    return c.uid;
  });
  const customToken = await auth.createCustomToken(uid, {
    windowsUsername: d.username,
    windowsVerifiedAt: Date.now(),
    mesDevice: d.deviceId,
  });
  return { customToken };
});
export const loginManagedUser = onCall(options, async (request) => {
  if ((await policy()).requiresWindows)
    throw new HttpsError(
      "permission-denied",
      "Signed Windows verification is required.",
    );
  const uid = id(request.data?.uid),
    user = await db.doc(`users/${uid}`).get();
  if (!user.data()?.active)
    throw new HttpsError("permission-denied", "User inactive.");
  return { customToken: await auth.createCustomToken(uid) };
});
export const manageDirectory = onCall(options, async (request) => {
  owner(request);
  const { type, operation } = request.data || {};
  if (!["teamLeaders", "departments"].includes(type))
    throw new HttpsError("invalid-argument", "Invalid directory.");
  const ref =
    operation === "create"
      ? db.collection(type).doc()
      : db.doc(`${type}/${id(request.data.id)}`);
  if (operation === "create") {
    await ref.create({
      name: text(request.data.name, 80, "name"),
      active: true,
      createdAt: now(),
      updatedAt: now(),
    });
  } else if (operation === "update") {
    await ref.update({
      name: text(request.data.name, 80, "name"),
      updatedAt: now(),
    });
  } else if (operation === "deactivate") {
    await ref.update({
      active: request.data.active === true,
      updatedAt: now(),
    });
  } else throw new HttpsError("invalid-argument", "Invalid operation.");
  return { id: ref.id };
});
export const manageUser = onCall(options, async (request) => {
  owner(request);
  const d = request.data || {};
  if (d.operation === "create") {
    const username = text(d.username, 64, "username").toLowerCase(),
      displayName = text(d.displayName, 80, "display name");
    if (!validUsername(username) || username === "hpham")
      throw new HttpsError("invalid-argument", "Invalid or reserved username.");
    const uid = randomUUID();
    const userRef = db.doc(`users/${uid}`),
      keyRef = db.doc(`usernames/${username}`);
    await db.runTransaction(async (tx) => {
      if ((await tx.get(keyRef)).exists)
        throw new HttpsError("already-exists", "Username already exists.");
      tx.create(keyRef, { uid });
      tx.create(userRef, {
        username,
        displayName,
        active: false,
        provisioning: true,
        createdAt: now(),
      });
    });
    try {
      await auth.createUser({ uid, displayName });
      await userRef.update({ active: true, provisioning: FieldValue.delete() });
    } catch (e) {
      await db.runTransaction(async (tx) => {
        const current = await tx.get(userRef);
        if (current.data()?.provisioning) {
          tx.delete(userRef);
          tx.delete(keyRef);
        }
      });
      throw new HttpsError(
        "internal",
        "Could not create the authentication account. Try again.",
      );
    }
    return { uid };
  }
  const uid = id(d.uid),
    ref = db.doc(`users/${uid}`),
    snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found.");
  if (snap.data().provisioning)
    throw new HttpsError(
      "failed-precondition",
      "User provisioning is still in progress.",
    );
  if (d.operation === "update") {
    const displayName = text(d.displayName, 80, "display name"),
      username = d.username
        ? text(d.username, 64, "username").toLowerCase()
        : snap.data().username;
    if (!validUsername(username) || username === "hpham")
      throw new HttpsError("invalid-argument", "Invalid or reserved username.");
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const oldName = current.data().username;
      if (username !== oldName) {
        const key = db.doc(`usernames/${username}`);
        if ((await tx.get(key)).exists)
          throw new HttpsError("already-exists", "Username already exists.");
        tx.create(key, { uid });
        tx.delete(db.doc(`usernames/${oldName}`));
      }
      tx.update(ref, { username, displayName, updatedAt: now() });
    });
    await auth.updateUser(uid, { displayName });
    if (username !== snap.data().username) await auth.revokeRefreshTokens(uid);
  } else if (d.operation === "deactivate") {
    const active = d.active === true;
    await ref.update({ active, updatedAt: now() });
    await auth.updateUser(uid, { disabled: !active });
    if (!active) await auth.revokeRefreshTokens(uid);
  } else throw new HttpsError("invalid-argument", "Invalid operation.");
  return { uid };
});
export const setPolicy = onCall(options, async (request) => {
  owner(request);
  if (typeof request.data?.requiresWindows !== "boolean")
    throw new HttpsError("invalid-argument", "Invalid policy.");
  await db
    .doc("settings/policy")
    .set({ requiresWindows: request.data.requiresWindows, updatedAt: now() });
  return { ok: true };
});
export const registerDevice = onCall(options, async (request) => {
  owner(request);
  const label = text(request.data?.label, 80, "device label"),
    ref = db.collection("devices").doc(),
    secret = randomBytes(32).toString("base64");
  await ref.create({ label, secret, active: true, createdAt: now() });
  return {
    deviceId: ref.id,
    secret,
    label,
    allowedOrigins: ["https://mes.th.io.vn"],
  };
});
export const listDevices = onCall(options, async (request) => {
  owner(request);
  const snap = await db.collection("devices").get();
  return {
    devices: snap.docs.map((d) => ({
      id: d.id,
      label: d.data().label,
      active: d.data().active,
    })),
  };
});
export const revokeDevice = onCall(options, async (request) => {
  owner(request);
  await db
    .doc(`devices/${id(request.data?.id)}`)
    .update({ active: false, revokedAt: now() });
  return { ok: true };
});
export const createIssue = onCall(options, async (request) => {
  const who = await member(request),
    d = request.data || {};
  const subject = text(d.subject, 160, "subject"),
    process = text(d.process, 120, "process"),
    description = text(d.description, 5000, "description", 10);
  if (!who.owner && d.reporterUid !== who.uid)
    throw new HttpsError(
      "permission-denied",
      "You may submit only for your verified identity.",
    );
  let reporter = who;
  if (who.owner && d.reporterUid && d.reporterUid !== who.uid) {
    const u = await db.doc(`users/${id(d.reporterUid)}`).get();
    if (!u.data()?.active)
      throw new HttpsError("failed-precondition", "Reporter inactive.");
    reporter = { ...u.data(), uid: u.id };
  }
  const [leader, department] = await Promise.all([
    db.doc(`teamLeaders/${id(d.teamLeaderId)}`).get(),
    db.doc(`departments/${id(d.departmentId)}`).get(),
  ]);
  if (!leader.data()?.active || !department.data()?.active)
    throw new HttpsError(
      "failed-precondition",
      "Choose an active team leader and department.",
    );
  const ref = db.collection("issues").doc(),
    ev = event(ref, who, "created", "Feedback submitted.");
  await db.runTransaction(async (tx) => {
    const rateRef = db.doc(`submissionRates/${who.uid}`),
      rate = await tx.get(rateRef),
      r = rate.data();
    const inWindow =
      r && Date.now() - r.windowStart.toMillis() < 10 * 60 * 1000;
    if (inWindow && r.count >= 10)
      throw new HttpsError(
        "resource-exhausted",
        "Maximum 10 submissions per 10 minutes.",
      );
    tx.set(rateRef, {
      windowStart: inWindow ? r.windowStart : Timestamp.now(),
      count: inWindow ? r.count + 1 : 1,
    });
    tx.create(ref, {
      subject,
      process,
      description,
      reporterUid: reporter.uid,
      reporterName: reporter.displayName,
      reporterUsername: reporter.username,
      createdBy: who.uid,
      teamLeaderId: leader.id,
      teamLeaderName: leader.data().name,
      departmentId: department.id,
      departmentName: department.data().name,
      status: "New",
      priority: "Medium",
      assessment: "",
      deleting: false,
      attachments: [],
      uploadSlots: Array.from({ length: 5 }, () => randomUUID()),
      createdAt: now(),
      updatedAt: now(),
    });
    tx.create(ev.ref, ev.data);
  });
  return { id: ref.id, uploadSlots: (await ref.get()).data().uploadSlots };
});
export const attachFiles = onCall(options, async (request) => {
  const who = await member(request),
    issueId = id(request.data?.issueId),
    ref = db.doc(`issues/${issueId}`),
    issue = await ref.get();
  if (!issue.exists || issue.data().deleting)
    throw new HttpsError("not-found", "Issue not found.");
  if (!who.owner && issue.data().createdBy !== who.uid)
    throw new HttpsError("permission-denied", "Not your upload.");
  const files = request.data?.files;
  if (!Array.isArray(files) || files.length > 5)
    throw new HttpsError("invalid-argument", "Maximum 5 attachments.");
  if (new Set(files.map((f) => f.slot)).size !== files.length)
    throw new HttpsError("invalid-argument", "Duplicate upload slots.");
  const verified = [];
  for (const file of files) {
    const slot = id(file.slot);
    if (!issue.data().uploadSlots.includes(slot))
      throw new HttpsError("permission-denied", "Invalid upload slot.");
    const path = `issues/${issueId}/${slot}`;
    const [metadata] = await bucket.file(path).getMetadata();
    if (
      Number(metadata.size) <= 0 ||
      Number(metadata.size) > 10 * 1024 * 1024 ||
      !TYPES.includes(metadata.contentType)
    )
      throw new HttpsError("invalid-argument", "Unsupported attachment.");
    verified.push({
      path,
      name: text(file.name, 180, "filename"),
      size: Number(metadata.size),
      type: metadata.contentType,
    });
  }
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists)
      throw new HttpsError("not-found", "Issue was removed.");
    const attachments = [...(current.data().attachments || [])];
    let added = 0;
    for (const f of verified)
      if (!attachments.some((a) => a.path === f.path)) {
        attachments.push(f);
        added++;
      }
    if (!added) return;
    if (attachments.length > 5)
      throw new HttpsError("failed-precondition", "Maximum 5 attachments.");
    tx.update(ref, { attachments, updatedAt: now() });
    const ev = event(ref, who, "attachments", `${added} attachment(s) added.`);
    tx.create(ev.ref, ev.data);
  });
  return { ok: true };
});
export const updateIssue = onCall(options, async (request) => {
  owner(request);
  const d = request.data || {},
    ref = db.doc(`issues/${id(d.id)}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Issue not found.");
    const changes = { updatedAt: now() },
      before = snap.data();
    let message,
      extra = {};
    if (d.operation === "edit") {
      changes.subject = text(d.subject, 160, "subject");
      changes.process = text(d.process, 120, "process");
      changes.description = text(d.description, 5000, "description", 10);
      message = "Owner edited the feedback details.";
      extra = {
        before: {
          subject: before.subject,
          process: before.process,
          description: before.description,
        },
        after: {
          subject: changes.subject,
          process: changes.process,
          description: changes.description,
        },
      };
    } else if (d.operation === "handling") {
      if (!STATUSES.includes(d.status) || !PRIORITIES.includes(d.priority))
        throw new HttpsError("invalid-argument", "Invalid status or priority.");
      changes.status = d.status;
      changes.priority = d.priority;
      changes.assessment =
        typeof d.assessment === "string" ? d.assessment.trim() : "";
      if (changes.assessment.length > 3000)
        throw new HttpsError("invalid-argument", "Assessment is too long.");
      if (d.status === "Resolved" || d.status === "Closed") {
        if (!["Resolved", "Closed"].includes(before.status))
          changes.resolvedAt = now();
      } else changes.resolvedAt = FieldValue.delete();
      message = `Status: ${before.status} → ${d.status}. Priority: ${before.priority} → ${d.priority}.`;
      if (d.note) message += " " + text(d.note, 500, "note");
      if (changes.assessment !== before.assessment)
        message += "\nAssessment: " + (changes.assessment || "(cleared)");
    } else throw new HttpsError("invalid-argument", "Invalid operation.");
    tx.update(ref, changes);
    const ev = event(
      ref,
      {
        uid: request.auth.uid,
        displayName: request.auth.token.name || "MES Owner",
      },
      d.operation,
      message,
      extra,
    );
    tx.create(ev.ref, ev.data);
  });
  return { ok: true };
});
export const addComment = onCall(options, async (request) => {
  owner(request);
  const ref = db.doc(`issues/${id(request.data?.issueId)}`),
    message = text(request.data?.text, 3000, "comment");
  await db.runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists)
      throw new HttpsError("not-found", "Issue not found.");
    tx.update(ref, { updatedAt: now() });
    const ev = event(
      ref,
      {
        uid: request.auth.uid,
        displayName: request.auth.token.name || "MES Owner",
      },
      "comment",
      message,
    );
    tx.create(ev.ref, ev.data);
  });
  return { ok: true };
});
export const deleteIssue = onCall(options, async (request) => {
  owner(request);
  const ref = db.doc(`issues/${id(request.data?.id)}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  await ref.update({ deleting: true });
  await bucket.deleteFiles({ prefix: `issues/${ref.id}/` });
  await db.recursiveDelete(ref);
  return { ok: true };
});
export const cleanExpiredChallenges = onSchedule("every 24 hours", async () => {
  for (let n = 0; n < 10; n++) {
    const expired = await db
      .collection("challenges")
      .where("expiresAt", "<", Timestamp.now())
      .limit(400)
      .get();
    if (!expired.size) break;
    const batch = db.batch();
    expired.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
});
