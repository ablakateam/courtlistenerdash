import assert from "node:assert/strict";
import { test } from "node:test";
import type { JsonObject } from "../src/shared/types.js";
import type { LegalAiClient } from "../src/server/legal-ai.js";
import { answerPageAssistantQuestion } from "../src/server/page-assistant.js";

function fakeAi(prompts: string[]) {
  return {
    async completeJson(_system: string, user: string): Promise<JsonObject> {
      prompts.push(user);
      return {
        answer: { text: "The page supports grounded legal research.", sourceParagraphs: ["P1"] },
        caveats: ["Review the underlying authority."],
        suggestedQuestions: ["What should I verify next?"],
      };
    },
    async configuration() {
      return { provider: "ollama" as const, baseUrl: "https://ollama.com", model: "gemma4:31b", apiKey: "not-returned" };
    },
  } as unknown as LegalAiClient;
}

test("page assistant binds answers to supplied page passages", async () => {
  const prompts: string[] = [];
  const result = await answerPageAssistantQuestion({
    route: "/research",
    pageTitle: "Legal Research",
    question: "What can I do here?",
    contextText: "Brown v. Board of Education\n\n347 U.S. 483\n\nSeparate educational facilities are inherently unequal.",
    contextTruncated: false,
    history: [{ role: "user", text: "Help me understand this page" }],
    ai: fakeAi(prompts),
  });
  assert.equal(result.answer?.sources[0]?.verified, true);
  assert.equal(result.provider, "ollama");
  assert.equal(result.model, "gemma4:31b");
  assert.equal(result.context.protected, false);
  assert.ok(result.context.capturedCharacters > 0);
  assert.equal(result.context.retrievalMode, "live_page_rag");
  assert.ok(result.context.indexedPassages >= result.context.retrievedPassages);
  assert.equal(JSON.stringify(result).includes("not-returned"), false);
  assert.match(prompts[0] ?? "", /SOURCE PASSAGES/);
});

test("page assistant excludes protected workspace content from the provider prompt", async () => {
  const prompts: string[] = [];
  const result = await answerPageAssistantQuestion({
    route: "/settings",
    pageTitle: "Settings & Connections",
    question: "Explain this page",
    contextText: "super-secret-provider-value",
    contextTruncated: false,
    history: [],
    ai: fakeAi(prompts),
  });
  assert.equal(result.context.protected, true);
  assert.equal(result.context.capturedCharacters, 0);
  assert.equal(prompts[0]?.includes("super-secret-provider-value"), false);
  assert.match(prompts[0] ?? "", /TRUSTED PLATFORM NAVIGATION[\s\S]*Judges: \/judges/);
  assert.ok(result.caveats.some((value) => /privacy-protected/i.test(value)));
});

test("page assistant rejects a source ID that was not supplied to the model", async () => {
  const ai = {
    async completeJson(): Promise<JsonObject> {
      return { answer: { text: "Unsupported conclusion", sourceParagraphs: ["P100"] }, caveats: [], suggestedQuestions: [] };
    },
    async configuration() {
      return { provider: "ollama" as const, baseUrl: "https://ollama.com", model: "gemma4:31b", apiKey: "not-returned" };
    },
  } as unknown as LegalAiClient;
  const context = Array.from({ length: 150 }, (_, index) => `Section ${index + 1} ${"public record text ".repeat(55)}`).join("\n\n");
  const result = await answerPageAssistantQuestion({
    route: "/research",
    pageTitle: "Large research result",
    question: "Where is the narrow issue discussed?",
    contextText: context,
    contextTruncated: false,
    history: [],
    ai,
  });
  assert.equal(result.answer, null);
  assert.ok(result.caveats.some((value) => /valid current-page source/i.test(value)));
});

test("live page retrieval prioritizes visible actions for navigation questions", async () => {
  const prompts: string[] = [];
  const context = [
    "AVAILABLE PAGE ACTIONS",
    '[ACTION A1] Link "Open full opinion" opens /documents/opinion/42 in Opinion.',
    '[ACTION A2] Button "Save authority" in Research result.',
    "VISIBLE PAGE CONTENT",
    ...Array.from({ length: 180 }, (_, index) => `Record section ${index + 1} ${"procedural history and public legal record. ".repeat(12)}`),
  ].join("\n\n");
  const result = await answerPageAssistantQuestion({
    route: "/cases/42",
    pageTitle: "Example case",
    question: "Which button or link opens the full opinion?",
    contextText: context,
    contextTruncated: false,
    history: [],
    ai: fakeAi(prompts),
  });
  assert.match(prompts[0] ?? "", /\[ACTION A1\] Link "Open full opinion"/);
  assert.equal(result.context.availableActions, 2);
  assert.ok(result.context.retrievedPassages < result.context.indexedPassages);
  assert.equal(result.context.truncated, false);
  assert.ok(result.caveats.some((value) => /live page index retrieved/i.test(value)));
});
