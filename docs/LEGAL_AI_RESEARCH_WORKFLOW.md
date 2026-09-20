# Grounded legal-AI research workflow

Reviewed: 2026-09-19

## Research purpose

CourtListenerDash semantic search finds CourtListener opinions that are legally
or factually relevant even when the opinions do not use the researcher's exact
words. It is not a general chatbot and it does not generate authorities.

Every semantic session preserves this sequence:

1. **Research question** — the lawyer's own statement of the problem.
2. **Search intent** — legal issue, similar facts, doctrine/rule, procedure,
   useful reasoning, or authority to distinguish/limit.
3. **Relevant authorities** — selected and ranked by CourtListener's Citegeist
   semantic opinion search.
4. **Why the result appears** — its CourtListener semantic-match status and the
   source passage returned by the CourtListener index.
5. **Full authority** — direct access to the case workspace and original source.
6. **Grounded case analysis** — optional analysis of the complete retrieved
   opinion, with source-paragraph evidence for every displayed conclusion.
7. **Deeper research** — full opinion, cited authorities, citing cases, docket,
   documents, and related semantic research without rebuilding context.

Keyword search remains separate. It is preferable when the lawyer knows an
exact party, citation, phrase, judge, docket term, or Boolean formulation.

## Product-pattern review

The implementation uses workflow patterns, not another product's visual design:

| Current pattern | Why it helps | CourtListenerDash application |
|---|---|---|
| Natural-language question plus explicit jurisdiction and retained history | Keeps the legal question and scope visible instead of turning research into an opaque chat | Research-intent selector, validated CourtListener court field, saved semantic session |
| AI answer and authorities visible together | Lets an attorney verify while reading instead of opening a separate citation workflow | Structured case analysis beside verified source passages and direct full-opinion navigation |
| Page/passage-level source references with an in-context viewer | Makes a synthesis auditable | Server-generated paragraph IDs, exact CourtListener excerpts, and “Locate in full opinion” |
| Multiple purpose-built legal workflows instead of one generic prompt box | Reduces prompt engineering and records what work is being done | Six semantic intents and structured case-question shortcuts |
| Related-document discovery by citation links and by semantic similarity | Finds both doctrinal lineage and factually similar cases | Citation graph/citing-authority tabs plus “Find cases with similar facts” semantic handoff |
| Structured comparison and tabular review | Makes differences easier to inspect than narrative prose | Reserved next-phase case-comparison workspace; not mixed into the initial case brief |
| Visible research plan and source-backed output | Helps the lawyer evaluate completeness and defensibility | Full-document progress, section count, source coverage, and explicit verification notice |

Primary product materials reviewed:

- vLex Vincent, “Ask a Research Question”:
  https://knowledge.vlex.com/en/features/vincent/ask-a-research-question
- vLex Vincent, “Enhanced References”:
  https://knowledge.vlex.com/en/features/vincent/enhanced-references
- vLex Vincent, “Find Related Documents”:
  https://knowledge.vlex.com/en/features/vincent/find-related-documents
- vLex Vincent, “Explore a Legal Proposition”:
  https://knowledge.vlex.com/en/features/vincent/explore-a-legal-proposition
- Thomson Reuters CoCounsel Legal:
  https://legal.thomsonreuters.com/en/products/cocounsel-legal
- Lexis+ product overview:
  https://www.lexisnexis.com/en-us/products/lexis-plus.page
- CourtListener Citegeist semantic-search documentation:
  https://wiki.free.law/c/courtlistener/help/search/the-citegeist-relevancy-engine
- CourtListener Legal Search API:
  https://wiki.free.law/c/courtlistener/help/api/rest/v4/search

## Complete-opinion analysis pipeline

The analysis pipeline does not truncate the first portion of a long opinion.

1. Retrieve the complete opinion using CourtListener MCP `read_document` and an
   opinion ID, never a search-result cluster ID.
2. Remove presentation markup and divide the text into stable, numbered source
   paragraphs (`P1`, `P2`, and so on).
3. Assemble consecutive logical windows that cover every paragraph.
4. Analyze every window for posture, facts, issues, holding, rule, reasoning,
   authorities, distinctions, disposition, and separate opinions.
5. Hierarchically consolidate section findings when the combined material is
   too large for one model request.
6. Run a final holding/rule consistency pass over the complete set of section
   findings.
7. Reject any conclusion that does not cite an existing source paragraph.
8. Ignore model-supplied quotation text and display the exact paragraph copied
   from the CourtListener opinion.
9. Require authority citations to occur in the retrieved opinion before they
   can appear in the “key authorities” list.
10. Cache the completed analysis by opinion ID so returning to a case does not
    repeat model work.

The resulting brief prioritizes **Holding**, **Rule of law**, **Why the court
reached the result**, **Key material fact**, **Disposition**, and **Procedural
posture**, then exposes deeper facts, issues, reasoning, separate opinions,
authorities, limitations, and practical significance.

## Trust boundaries

- CourtListener determines which authorities exist and supplies their text.
- The analysis provider never performs authority retrieval for semantic search.
- An unconfigured or failing provider produces no AI conclusion; the feature
  fails closed.
- Opinion text is treated as untrusted data and cannot override analysis
  instructions.
- Only source-linked claims are displayed.
- “Verified passage” means the excerpt exactly came from the retrieved
  CourtListener opinion. It does not mean the legal interpretation is correct
  or that the authority remains good law.
- CourtListener citation relationships are not editorial treatment signals.
- Attorney review of the full opinion and subsequent history remains required.

## Provider and privacy model

The analysis connector is isolated from CourtListener credentials and saved
research. It supports a loopback Ollama endpoint, an OpenAI-compatible API, or
the Anthropic API. Configuration and API keys are encrypted at rest with
AES-256-GCM and are never returned to the browser.

The UI discloses that public opinion text will be sent to the selected provider.
This feature does not send docket filings, user-uploaded documents, or private
matter data. A legal organization should connect only a provider approved under
its confidentiality and data-governance rules.
