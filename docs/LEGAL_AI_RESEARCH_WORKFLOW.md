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

## Page-aware legal research assistant

The persistent assistant is an orientation and current-screen analysis layer.
It does not replace CourtListener search, citation verification, or complete-
opinion analysis.

1. The browser identifies the current route and takes a fresh snapshot only
   when the lawyer submits a question.
2. Form controls, technical JSON, hidden elements, and assistant content are
   removed before capture.
3. Settings, MCP/API diagnostics, alerts, saved research, and RECAP filing text
   use protected mode: only the question and fixed page-purpose guidance leave
   the application.
4. The backend assigns stable paragraph IDs to the allowed snapshot and treats
   both the page and prior conversation as untrusted material.
5. The model must answer in a strict JSON schema and cite supplied paragraph
   IDs. Answers without a valid paragraph reference are discarded.
6. Displayed excerpts are copied from the captured page, never accepted from
   model-generated quotation text.
7. The lawyer can expand a source and locate the corresponding passage on the
   live page.
8. Each session permits one active assistant request, preventing accidental
   duplicate paid-provider calls.
9. Oversized snapshots are reduced conservatively and produce a visible
   incomplete-context caveat.

The distinction is deliberate: **current-page answer** means the visible and
captured screen; **complete-opinion analysis** means every retrieved opinion
section passed through the long-document pipeline.

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
- Assistant conversation history is useful for follow-up wording but is never
  accepted as legal evidence; each answer must bind to the fresh page snapshot.

## Provider and privacy model

The analysis connector is isolated from CourtListener credentials and saved
research. It supports the direct paid Ollama Cloud API, a loopback Ollama
service, another Ollama-compatible endpoint, an OpenAI-compatible API, or the
Anthropic API. Configuration and API keys are encrypted at rest with
AES-256-GCM and are never returned to the browser.

For Ollama, the backend reads the selected endpoint's live `/api/tags` catalog
and returns only safe model metadata to the settings screen. Direct Ollama
Cloud model names are used exactly as returned by `https://ollama.com/api/tags`;
local cloud shortcuts may have different names. The administrator can select a
catalog model from a grouped dropdown or deliberately enter a model name when a
compatible server does not expose a catalog. Changing the provider endpoint
does not carry the previously encrypted key to the new host.

The UI discloses that the user's question and allowed current-page text will be
sent to the selected provider. A snapshot can include a visible research query
as well as public CourtListener data. Complete case analysis sends public
opinion text. The page assistant can also send visible public search results,
docket metadata, oral-argument transcripts, judicial profiles, and disclosure
records. It does not send credential forms, technical-console content, alert
queries, saved-research content, RECAP filing text, user-uploaded documents, or
private matter data. A legal organization should connect only a provider
approved under its confidentiality and data-governance rules and should not
type confidential client facts into the assistant without authorization.
