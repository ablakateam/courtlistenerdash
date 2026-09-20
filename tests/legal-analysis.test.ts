import assert from "node:assert/strict";
import { test } from "node:test";
import { bindGroundedClaimForTest, paragraphizeForAnalysis } from "../src/server/legal-analysis.js";

test("opinion analysis creates stable paragraph references from CourtListener HTML", () => {
  const paragraphs = paragraphizeForAnalysis("<h2>Opinion</h2><p>The judgment is affirmed.</p><p>The rule follows from Example v. State.</p>");
  assert.deepEqual(paragraphs.map((item) => item.id), ["P1", "P2", "P3"]);
  assert.equal(paragraphs[1].text, "The judgment is affirmed.");
});

test("analysis claims are displayed only with valid source references and exact excerpts", () => {
  const paragraphs = paragraphizeForAnalysis("<p>The court holds that the warrant was required.</p><p>The judgment is reversed.</p>");
  const grounded = bindGroundedClaimForTest({ text: "A warrant was required.", sourceParagraphs: ["P1"] }, paragraphs);
  assert.equal(grounded?.sources[0].excerpt, "The court holds that the warrant was required.");
  assert.equal(grounded?.sources[0].verified, true);
  assert.equal(bindGroundedClaimForTest({ text: "Invented claim", sourceParagraphs: ["P99"] }, paragraphs), null);
  assert.equal(bindGroundedClaimForTest({ text: "Unsupported claim", sourceParagraphs: [] }, paragraphs), null);
});
