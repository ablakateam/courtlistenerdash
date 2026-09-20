import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AppDatabase } from "../src/server/database.js";
import { normalizeTypeSafeConfig, TypeSafeConfigStore } from "../src/server/typesafe-config-store.js";
import { TypeSafeDecisionService } from "../src/server/typesafe-decision-service.js";

test("Jev configuration is encrypted and semantic decisions retain source provenance", async () => {
  const directory = join(tmpdir(), `courtlistenerdash-jev-${randomBytes(8).toString("hex")}`);
  const path = join(directory, "typesafe.enc");
  const store = new TypeSafeConfigStore(path, randomBytes(32).toString("base64"));
  const apiKey = "typesafe-test-key-not-real";
  await store.set({ apiKey, model: "jev-1.13.0", mode: "active" });
  const encrypted = await readFile(path, "utf8");
  assert.equal(encrypted.includes(apiKey), false);
  assert.deepEqual(await store.get(), { apiKey, model: "jev-1.13.0", mode: "active" });

  const db = new AppDatabase(join(directory, "test.sqlite3"));
  let calls = 0;
  const fakeClient = {
    models: { async list() { return [{ name: "jev-1.13.0", description: "Pinned", release_date: "2026-09-17" }]; } },
    async systemOne(request: { state: unknown }) {
      calls += 1;
      const state = request.state as { courtlistener_candidate?: { matched_opinion_passage?: string } };
      const relevant = state.courtlistener_candidate?.matched_opinion_passage?.includes("authentication") ? 0.94 : 0.22;
      return {
        model: "jev-1.13.0",
        answers: {
          overall: { type: "noul", noul: relevant },
          legal_issue: { type: "noul", noul: relevant },
          facts: { type: "noul", noul: relevant - 0.05 },
          procedure: { type: "noul", noul: relevant - 0.1 },
          direct_answer: { type: "noul", noul: relevant - 0.02 },
          distinguish_limit: { type: "noul", noul: 0.08 },
        },
        usage: { input_tokens: 400, output_tokens: 20 },
      };
    },
  };
  const service = new TypeSafeDecisionService(store, db, 5_000, () => fakeClient as never);
  try {
    await service.validate({ apiKey, model: "jev-1.13.0", mode: "active" });
    const input = { results: [
      { id: 1, caseName: "General Evidence Case", snippet: "The court discussed evidence generally." },
      { id: 2, caseName: "Digital Evidence Case", snippet: "The court resolved authentication of digital evidence." },
    ] };
    const output = await service.enhanceSemanticResults(input, "authentication of digital evidence", "issue") as { results: Array<Record<string, unknown>> };
    assert.equal(output.results[0].id, 2);
    const lens = output.results[0]._jev as { schemaVersion: string; evidenceExcerpt: string; originalRank: number; assistedRank: number };
    assert.equal(lens.schemaVersion, "search_relevance_noul_v1");
    assert.match(lens.evidenceExcerpt, /authentication/);
    assert.equal(lens.originalRank, 2);
    assert.equal(lens.assistedRank, 1);
    const firstCallCount = calls;
    await service.enhanceSemanticResults(input, "authentication of digital evidence", "issue");
    assert.equal(calls, firstCallCount);
    const status = await service.status();
    assert.equal(status.usage.requests, 2);
    assert.ok(status.usage.cacheHits >= 2);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("Jev active mode requires a pinned model and never truncates CourtListener results on failure", async () => {
  assert.throws(
    () => normalizeTypeSafeConfig({ apiKey: "typesafe-test-key", model: "jev-latest", mode: "active" }),
    /pinned Jev model version/,
  );
  const directory = join(tmpdir(), `courtlistenerdash-jev-failure-${randomBytes(8).toString("hex")}`);
  const store = new TypeSafeConfigStore(join(directory, "typesafe.enc"), randomBytes(32).toString("base64"));
  await store.set({ apiKey: "typesafe-test-key", model: "jev-1.13.0", mode: "active" });
  const db = new AppDatabase(join(directory, "test.sqlite3"));
  const failingClient = {
    models: { async list() { return []; } },
    async systemOne() { throw new Error("fixture provider unavailable"); },
  };
  const service = new TypeSafeDecisionService(store, db, 5_000, () => failingClient as never);
  const input = { results: Array.from({ length: 35 }, (_, index) => ({ id: index + 1, snippet: `Public opinion passage ${index + 1}` })) };
  try {
    const output = await service.enhanceSemanticResults(input, "test the complete result set", "issue") as { results: Array<Record<string, unknown>> };
    assert.equal(output.results.length, 35);
    assert.equal((output.results[0]._jev as { status: string }).status, "unavailable");
    assert.equal(output.results[30]._jev, undefined);
    assert.equal(output.results[34].id, 35);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
