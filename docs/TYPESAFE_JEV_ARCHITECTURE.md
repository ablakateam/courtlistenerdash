# TypeSafe Jev legal-decision architecture

Last reviewed: **2026-09-20**<br>
Implemented schema: **`search_relevance_noul_v1`**<br>
Lifecycle: **experimental, evaluation-gated**

## Why Jev belongs here

CourtListener supplies the legal source record. Semantic search retrieves a
shortlist. A generative model can explain retrieved law. Jev has a different
job: make narrow, typed judgments that ordinary code can sort, route, cache,
measure, and audit.

The first use is legal-relevance reranking:

```text
Research question + explicit intent
  → CourtListener semantic candidates
    → Jev evaluates each candidate independently
      → typed probabilities + provenance
        → shadow comparison or experimental assisted order
```

It does not generate a holding, case name, citation, or legal answer. The
authority shown to the researcher still comes from CourtListener.

## Official material reviewed

The design follows TypeSafe's official [introduction](https://docs.typesafe.ai/introduction),
[primitives](https://docs.typesafe.ai/primitives),
[models](https://docs.typesafe.ai/models),
[confidence guidance](https://docs.typesafe.ai/confidence),
[JavaScript SDK](https://docs.typesafe.ai/sdk/javascript), and
[Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
The most relevant published patterns are the
[legal reranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe),
[RAG-passage classifier](https://docs.typesafe.ai/cookbooks/classifying_rag_passages),
[citation-support checker](https://docs.typesafe.ai/cookbooks/citation_check),
[line-by-line search](https://docs.typesafe.ai/cookbooks/semantic_find), and
[hierarchical classification](https://docs.typesafe.ai/cookbooks/hierarchical_classification).

As of this review, the documented current model is `jev-1.13.0`; listed input
pricing is $0.042 per million tokens and output tokens are not charged. The
documented limits are 1,200 requests per minute, 250,000 tokens per second,
64,000 tokens per request, and 32,000 tokens for state plus the longest
question. TypeSafe states that these limits may change dynamically. The
application therefore treats price and capacity as observed provider metadata,
not a permanent entitlement.

TypeSafe's published CLERC example moved a correct legal passage into the top
10 for 62% of 40 queries, compared with 38% for its BM25 shortlist. That is a
promising vendor-authored demonstration, not evidence that this application's
questions or CourtListener result set meet a production threshold. Our own
attorney-reviewed benchmark remains mandatory.

## Implemented prototype

### Connection and operations

- An administrator pastes the TypeSafe API key in **Settings → Jev
  Intelligence**.
- The backend validates the key with the official TypeSafe JavaScript SDK and
  loads the account's model catalog.
- The endpoint is fixed to `https://api.typesafe.ai`; it is not a general URL
  field.
- The key is encrypted with AES-256-GCM in the application's data directory,
  never returned to the browser, and removable without deleting audit rows.
- Active mode refuses moving `latest` or `preview` aliases. Production-facing
  decisions must use a pinned and evaluated model version.

### Operating modes

| Mode | Behavior |
|---|---|
| Off | No Jev calls. CourtListener behavior is unchanged. |
| Evaluation | Connection and model can be validated; normal research does not call Jev. |
| Shadow | Jev scores results and shows a preview rank, but CourtListener order remains authoritative. |
| Active experimental | The evaluated shortlist is reordered by Jev probability. The UI continues to show both ranks and labels the result experimental. |

If TypeSafe is unavailable, slow, or rejects the request, semantic search fails
open to the complete original CourtListener order. No candidate is discarded
because Jev failed.

### Decision contract

`search_relevance_noul_v1` sends only the research question, selected research
intent, public CourtListener metadata, and a bounded matched opinion excerpt.
One request per candidate asks six independent Noul questions in parallel:

1. overall research fit;
2. same legal issue or doctrine;
3. materially comparable facts or evidence;
4. relevant procedural posture;
5. a directly useful rule, holding, or reasoning passage; and
6. whether the passage distinguishes, limits, questions, or declines to extend
   the proposition.

Each Noul returns the probability of “yes.” These are model inferences—not
source facts and not percentages of legal correctness. The current descriptive
relevance bands are explicitly experimental and must not be used as autonomous
legal-review thresholds.

The service evaluates at most 30 candidates with bounded concurrency. Any
additional CourtListener candidates remain in the response untouched. Results
are cached by query, source-text hash, schema version, and pinned model. Stored
records retain model version, schema, source identifier and hash, timestamp,
probabilities, latency, input-token count, estimated cost, and the public source
excerpt.

### Research interface

The visual **Jev Decision Lens** intentionally separates four things:

- the CourtListener authority and metadata;
- the CourtListener rank;
- Jev's experimental rank and typed signals; and
- the source excerpt evaluated by Jev.

The **Jev Research Map** summarizes the distribution without hiding the result
cards. The separate **Decision Lab** exposes operating mode, model version,
schema, source boundary, cost, latency, cache behavior, recent decisions, and
readiness gates. This makes uncertainty and provenance inspectable instead of
turning a probability into decorative certainty.

## Evaluation gate

The versioned harness in [`eval/`](../eval/) accepts an attorney-reviewed JSONL
dataset and reports:

- nDCG@10;
- MRR@10;
- precision@5;
- recall@10;
- Brier score;
- expected calibration error;
- p50 and p95 latency; and
- estimated API cost.

Labels use a 0–3 rubric from irrelevant to directly responsive. Candidate pools
must include multiple jurisdictions, court levels, issues, procedural postures,
writing styles, long/short passages, and hard negatives. At least two attorneys
should label independently, disagreements should be adjudicated, and the
dataset/model/schema versions must be frozen before scoring.

Before active mode is recommended, the prototype must demonstrate all of the
following on the held-out dataset:

1. a material improvement over the untouched CourtListener order on nDCG@10
   and MRR@10;
2. no unacceptable loss of recall@10;
3. calibrated probabilities adequate for the intended display or routing use;
4. acceptable jurisdiction and practice-area slices, not only a good overall
   average;
5. acceptable p95 latency and measured cost;
6. resilience to quoted instructions and adversarial text inside opinions; and
7. stable results after a pinned model or schema change is deliberately
   reevaluated.

Thresholds such as 0.95/0.80/0.60 are hypotheses, not policy. They must be
selected from calibration and error-cost evidence for each schema. No current
Jev score autonomously changes a legal conclusion or suppresses an authority.

## Opportunity map

The next opportunities are ordered by usefulness and testability.

| Opportunity | Role for Jev | Required proof before use |
|---|---|---|
| Opinion Navigator | Classify paragraphs as facts, issue, rule, standard, analysis, holding, disposition, concurrence, or dissent. | Paragraph-level provenance recall and attorney agreement. |
| Summary claim checker | Decide whether the exact cited passage supports, contradicts, or does not address one generated summary claim. | Attorney-reviewed claim/passage pairs; never label this “citation valid.” |
| Assistant context gate | Keep responsive evidence, separate contradictions, and reject embedded instructions before an LLM call. | Missed-authority, injection, and answer-quality evaluation. |
| Unified-query router | Choose the appropriate CourtListener workflow without merging result types. | High recall for citations, RECAP, judges, arguments, and disclosures; easy manual override. |
| Legal-signal index | Attach versioned issue, posture, evidence, motion, outcome, and document-type signals to public opinions. | Taxonomy governance and per-label precision/recall. |
| Similar-case hybrid | Combine embeddings with issues, facts, posture, jurisdiction, outcome, and cited authorities. | Attorney pairwise-similarity labels and ablation testing. |
| Docket event classifier | Classify public RECAP events into a procedural timeline. | Filing-level labels; attachment and sealed/private-data rules. |
| Entity alignment | Link duplicate parties, firms, judges, statutes, and normalized citations from pre-parsed candidates. | False-merge ceiling and mandatory review band. |
| Citation-treatment triage | Flag language that may follow, distinguish, limit, question, or overrule. | Large authoritative evaluation; always labeled preliminary and never marketed as a citator. |

Jev is not appropriate for generating summaries, quotations, legal arguments,
free-form explanations, exact arithmetic, date comparison, citation extraction
from an unconstrained answer space, or deciding whether authority is still good
law. Code handles exact calculations and dates; parsers handle deterministic
metadata; a grounded generative model handles prose; an authoritative citator
remains necessary for treatment and currency.

## Security and data handling

The implemented prototype sends public CourtListener opinion material only.
It excludes RECAP filing text, uploads, saved research, assistant conversations,
credentials, and private matter content. This conservative boundary remains in
force even if an administrator connects a key.

TypeSafe's documentation states that customer requests and responses are not
used to train Jev. Its legal terms still permit processing and retention needed
to provide the service and describe enterprise zero-data-retention options.
Practices must review the provider agreement and approve the data path before
expanding beyond public opinions.

Opinion text is untrusted data. Jev 1.13 documentation warns that adversarial
content can influence decisions and that irrelevant large state reduces
accuracy. The service labels the source boundary, sends a short relevant
passage instead of a complete opinion, and must add an evaluated injection
signal before Jev is allowed to gate assistant context.

## Failure modes and fallback

| Failure | Required behavior |
|---|---|
| Missing or removed key | CourtListener search operates normally; no Jev panel is claimed as active. |
| Authentication or provider error | Preserve original results, mark the lens unavailable, record no fabricated probabilities. |
| Timeout or rate limit | Preserve original results; expose the operational error in Settings/Decision Lab. |
| Schema or model change | Create a new version, retain old decisions, rerun evaluation before activation. |
| Missing source excerpt | Do not infer a decision from case title alone as if full text was considered. |
| Duplicate result | Cache by query, source hash, schema, and model; show cache use in operational metrics. |
| Adversarial opinion text | Treat it as data, not instructions; keep fail-open search and test an explicit injection detector. |
| Low or ambiguous probability | Keep the CourtListener authority available and show uncertainty; do not convert it into a factual label. |

## Cost and latency expectations

The dashboard estimates cost from actual input tokens at the documented
`jev-1.13.0` input price. It stores measured duration rather than claiming the
provider's published latency for every deployment. Bounded concurrency keeps a
30-candidate shortlist responsive, while caching prevents repeated paid work
for the same query, source text, schema, and model. Any future corpus-wide
classification must use a separate queue, explicit spend controls,
idempotency, checkpointing, and reprocessing plan; it must not run inside an
interactive web request.

## Acceptance status

The connection, encrypted key store, pinned-model protection, shadow/active
modes, semantic reranker, fail-open behavior, cache, provenance, audit store,
Decision Lens, Decision Lab, and offline evaluation harness are implemented.
The integration is not labeled production-validated until a real key is
provided and an attorney-reviewed CourtListener benchmark passes. All other
opportunities in this document remain proposals, not implied product features.
