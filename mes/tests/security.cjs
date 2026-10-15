// Run ONLY against the demo emulators. Never point tests at production.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { readFileSync } = require("node:fs");
const rootRequire = createRequire(resolve(__dirname, "../../package.json"));
const { initializeTestEnvironment, assertSucceeds, assertFails } = rootRequire(
  "@firebase/rules-unit-testing",
);
const { doc, getDoc, setDoc, serverTimestamp } =
  rootRequire("firebase/firestore");
const { ref, uploadBytes, getBytes } = rootRequire("firebase/storage");
(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-th-mes",
    firestore: {
      host: "127.0.0.1",
      port: 8086,
      rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"),
    },
    storage: {
      host: "127.0.0.1",
      port: 9198,
      rules: readFileSync(resolve(__dirname, "../storage.rules"), "utf8"),
    },
  });
  try {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "settings/policy"), { requiresWindows: true });
      await setDoc(doc(db, "users/operator"), {
        username: "phtuan",
        displayName: "Operator",
        active: true,
      });
      await setDoc(doc(db, "devices/device"), {
        active: true,
        secret: "test-key-not-a-real-credential",
      });
      await setDoc(doc(db, "issues/test-issue"), {
        createdBy: "operator",
        uploadSlots: ["slot1", "slot2"],
        deleting: false,
        createdAt: serverTimestamp(),
        subject: "Test",
      });
    });
    const claims = {
      windowsUsername: "phtuan",
      windowsVerifiedAt: Date.now(),
      mesDevice: "device",
    };
    const operator = env.authenticatedContext("operator", claims),
      guest = env.unauthenticatedContext(),
      unverified = env.authenticatedContext("operator", {}),
      owner = env.authenticatedContext("owner", {
        email: "eric.scorp93@gmail.com",
        email_verified: true,
        firebase: { sign_in_provider: "google.com" },
      }),
      imposter = env.authenticatedContext("not-owner", {
        email: "eric.scorp93@gmail.com",
        email_verified: false,
        firebase: { sign_in_provider: "google.com" },
      });
    await assertSucceeds(
      getDoc(doc(operator.firestore(), "issues/test-issue")),
    );
    await assertFails(getDoc(doc(guest.firestore(), "issues/test-issue")));
    await assertFails(getDoc(doc(unverified.firestore(), "issues/test-issue")));
    await assertFails(getDoc(doc(imposter.firestore(), "issues/test-issue")));
    await assertSucceeds(getDoc(doc(owner.firestore(), "issues/test-issue")));
    await assertFails(
      setDoc(doc(operator.firestore(), "issues/forged"), { subject: "Forged" }),
    );
    await assertFails(
      setDoc(doc(owner.firestore(), "issues/forged"), {
        subject: "Owner bypass",
      }),
    );
    await assertFails(
      setDoc(doc(owner.firestore(), "issues/test-issue/timeline/forged"), {
        text: "Forged timeline",
      }),
    );
    await assertFails(getDoc(doc(operator.firestore(), "devices/device")));
    await assertFails(getDoc(doc(owner.firestore(), "devices/device")));
    await assertFails(
      getDoc(
        doc(
          env
            .authenticatedContext("operator", {
              ...claims,
              windowsUsername: "other",
            })
            .firestore(),
          "issues/test-issue",
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          env
            .authenticatedContext("operator", {
              ...claims,
              windowsVerifiedAt: Date.now() - 43200001,
            })
            .firestore(),
          "issues/test-issue",
        ),
      ),
    );
    const storage = operator.storage("gs://demo-th-mes.firebasestorage.app");
    const file = ref(storage, "issues/test-issue/slot1");
    await assertSucceeds(
      uploadBytes(file, new Uint8Array([137, 80, 78, 71]), {
        contentType: "image/png",
      }),
    );
    await assertFails(
      uploadBytes(file, new Uint8Array([137, 80, 78, 71]), {
        contentType: "image/png",
      }),
    );
    await assertFails(
      uploadBytes(
        ref(storage, "issues/test-issue/unknown"),
        new Uint8Array([1]),
        { contentType: "image/png" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(storage, "issues/test-issue/slot2"),
        new Uint8Array([1]),
        { contentType: "application/x-msdownload" },
      ),
    );
    await assertSucceeds(getBytes(file));
    await assertFails(
      getBytes(
        ref(
          guest.storage("gs://demo-th-mes.firebasestorage.app"),
          "issues/test-issue/slot1",
        ),
      ),
    );
    await env.withSecurityRulesDisabled(async (c) =>
      setDoc(doc(c.firestore(), "devices/device"), { active: false }),
    );
    await assertFails(getDoc(doc(operator.firestore(), "issues/test-issue")));
    console.log(
      "PASS: MES rules enforce owner-only server mutation, active signed Windows membership, private device keys and reserved attachment slots.",
    );
  } finally {
    await env.cleanup();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
