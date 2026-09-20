import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { hashPassword, passwordStrengthProblem, redactSecrets, verifyPassword } from "../src/server/security.js";
import { PasswordStore } from "../src/server/password-store.js";
import { TokenStore } from "../src/server/token-store.js";
import { LegalAiConfigStore } from "../src/server/ai-config-store.js";

test("password hashes verify without storing the password", async () => {
  const password = "Correct horse battery staple! 42";
  const encoded = await hashPassword(password);
  assert.match(encoded, /^scrypt\$/);
  assert.equal(encoded.includes(password), false);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("wrong password here", encoded), false);
});

test("administrator password policy rejects weak values", () => {
  assert.match(passwordStrengthProblem("short") || "", /14 characters/);
  assert.match(passwordStrengthProblem("passwordpassword123!") || "", /predictable/);
  assert.equal(passwordStrengthProblem("Long, distinct legal passphrase 82!"), null);
});

test("password store persists only a scrypt hash", async () => {
  const directory = join(tmpdir(), `courtlistenerdash-password-${randomBytes(8).toString("hex")}`);
  const path = join(directory, "administrator-password.hash");
  const password = "Long, distinct legal passphrase 82!";
  const hash = await hashPassword(password);
  try {
    const store = new PasswordStore(path, hash);
    assert.equal(await store.load(), hash);
    assert.equal((await readFile(path, "utf8")).includes(password), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("token store encrypts the CourtListener credential at rest", async () => {
  const directory = join(tmpdir(), `courtlistenerdash-token-${randomBytes(8).toString("hex")}`);
  const path = join(directory, "credential.enc");
  const key = randomBytes(32).toString("base64");
  const secret = "private-courtlistener-api-token-12345";
  try {
    const store = new TokenStore(path, key);
    await store.set(secret);
    assert.equal(await store.get(), secret);
    const disk = await readFile(path, "utf8");
    assert.equal(disk.includes(secret), false);
    assert.equal(JSON.parse(disk).algorithm, "aes-256-gcm");
    const reopened = new TokenStore(path, key);
    assert.equal(await reopened.get(), secret);
    await reopened.clear();
    assert.equal(await reopened.get(), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("legal AI configuration encrypts provider credentials at rest", async () => {
  const directory = join(tmpdir(), `courtlistenerdash-ai-config-${randomBytes(8).toString("hex")}`);
  const path = join(directory, "legal-ai.enc");
  const key = randomBytes(32).toString("base64");
  const secret = "provider-secret-value-12345";
  try {
    const store = new LegalAiConfigStore(path, key);
    await store.set({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "legal-model", apiKey: secret });
    assert.deepEqual(await store.get(), { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "legal-model", apiKey: secret });
    const disk = await readFile(path, "utf8");
    assert.equal(disk.includes(secret), false);
    assert.equal(disk.includes("api.openai.com"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("diagnostic redaction removes credential-like values", () => {
  const redacted = redactSecrets({
    token: "abc",
    nested: { Authorization: "Token highly-sensitive", safe: "visible" },
  });
  assert.deepEqual(redacted, {
    token: "[REDACTED]",
    nested: { Authorization: "[REDACTED]", safe: "visible" },
  });
});
