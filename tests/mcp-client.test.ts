import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXPECTED_MCP_TOOLS,
  STATE_CHANGING_TOOLS,
  courtListenerRetryDelayMs,
  normalizeMcpResultForTest,
} from "../src/server/mcp-client.js";

test("current official CourtListener MCP inventory is represented", () => {
  assert.equal(EXPECTED_MCP_TOOLS.length, 19);
  for (const name of [
    "search",
    "read_document",
    "search_document",
    "analyze_citations",
    "pray_for_document",
    "get_api_usage",
  ]) {
    assert.equal(EXPECTED_MCP_TOOLS.includes(name as (typeof EXPECTED_MCP_TOOLS)[number]), true);
  }
});

test("CourtListener rate-limit waits are parsed for safe read-only retries", () => {
  assert.equal(courtListenerRetryDelayMs("429: available in 27 seconds"), 35_000);
  assert.equal(courtListenerRetryDelayMs("Rate limited. Try again in about 4 seconds."), 12_000);
  assert.equal(courtListenerRetryDelayMs("Rate limit exceeded: 10/min. Expected available in 6 seconds."), 61_000);
  assert.equal(courtListenerRetryDelayMs("Rate limit exceeded: 100/hour. Expected available in 120 seconds."), null);
  assert.equal(courtListenerRetryDelayMs("Rate limit exceeded: 250/day."), null);
  assert.equal(courtListenerRetryDelayMs("Validation error"), null);
});

test("all account-changing tools require confirmation", () => {
  assert.deepEqual(
    [...STATE_CHANGING_TOOLS].sort(),
    [
      "create_search_alert",
      "delete_search_alert",
      "pray_for_document",
      "subscribe_to_docket_alert",
      "unsubscribe_from_docket_alert",
      "withdraw_prayer",
    ],
  );
});

test("MCP responses prefer structured content and parse JSON text", () => {
  assert.deepEqual(
    normalizeMcpResultForTest({ structuredContent: { count: 2 }, content: [] }),
    { count: 2 },
  );
  assert.deepEqual(
    normalizeMcpResultForTest({ content: [{ type: "text", text: '{"results":[1,2]}' }] }),
    { results: [1, 2] },
  );
  assert.equal(
    normalizeMcpResultForTest({ content: [{ type: "text", text: "No citations found." }] }),
    "No citations found.",
  );
});
