import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LegalAiConfigStore } from "../src/server/ai-config-store.js";
import { LegalAiClient } from "../src/server/legal-ai.js";

test("Ollama model discovery returns a safe cloud-first catalog and keeps credentials backend-only", async () => {
  const directory = join(tmpdir(), `courtlistenerdash-ollama-${randomBytes(8).toString("hex")}`);
  const apiKey = "ollama-test-key-not-real";
  const authorizationHeaders: string[] = [];
  const provider = createServer((request, response) => {
    authorizationHeaders.push(String(request.headers.authorization ?? ""));
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags") {
      response.end(JSON.stringify({
        models: [
          { model: "nomic-embed-text:latest", size: 274_302_450, details: { family: "nomic-bert", parameter_size: "137M" } },
          { model: "gpt-oss:120b-cloud", size: 384, details: { family: "gptoss", parameter_size: "116.8B" } },
          { model: "gemma4:31b-cloud", size: 342, details: {} },
          { model: "gemma4:31b-cloud", size: 342, details: {} },
          { model: "invalid model name", size: 1 },
        ],
      }));
      return;
    }
    if (request.url === "/api/chat") {
      response.end(JSON.stringify({ message: { role: "assistant", content: "{\"status\":\"ready\"}" } }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
  const store = new LegalAiConfigStore(join(directory, "legal-ai.enc"), randomBytes(32).toString("base64"));
  const client = new LegalAiClient(store, 5_000);
  try {
    const config = { provider: "ollama" as const, baseUrl: endpoint, model: "gemma4:31b-cloud", apiKey };
    const catalog = await client.listOllamaModels(config);
    assert.deepEqual(catalog.models.map(({ name, source }) => ({ name, source })), [
      { name: "gemma4:31b-cloud", source: "cloud" },
      { name: "gpt-oss:120b-cloud", source: "cloud" },
      { name: "nomic-embed-text:latest", source: "local" },
    ]);
    assert.equal(JSON.stringify(catalog).includes(apiKey), false);
    assert.equal(catalog.models[1]?.parameterSize, "116.8B");
    await client.test(config);
    assert.deepEqual(authorizationHeaders, [`Bearer ${apiKey}`, `Bearer ${apiKey}`]);
  } finally {
    await new Promise<void>((resolve) => provider.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
