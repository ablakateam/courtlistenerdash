# TypeSafe Jev prototype milestone

Date: **2026-09-20**<br>
Version: **1.3.0**<br>
Status: **Implementation accepted for experimental evaluation; legal-quality
benchmark pending**

## Delivered

- Independent backend Jev decision service using `@typesafe-ai/sdk` 0.6.0.
- Encrypted administrator-managed API key and fixed official provider endpoint.
- Pinned-model enforcement for active mode.
- Evaluation, shadow, active experimental, and off modes.
- Six-question semantic relevance contract over public CourtListener opinion
  candidates.
- Bounded parallel evaluation, cache, decision provenance, cost/latency usage,
  and additive SQLite audit storage.
- Fail-open preservation of every CourtListener candidate and original order.
- Jev Research Map, per-result Decision Lens, Settings connection card, and
  Decision Lab.
- Versioned schema registry and attorney-reviewed offline evaluation harness.
- Updated README, architecture, deployment, project-state, roadmap, changelog,
  lessons learned, and screenshots.

## Automated acceptance

| Gate | Result |
|---|---|
| Client and server TypeScript | Passed |
| Backend/security tests | 24 passed |
| Jev key encrypted at rest | Passed |
| Active reranking and source provenance | Passed |
| Repeat-call cache and usage accounting | Passed |
| Moving alias rejected in active mode | Passed |
| Provider failure keeps all 35 fixture results | Passed |
| Deterministic browser workflow | Six workflows passed in 15.6 seconds |
| Production bundle | Passed; Vite and Node server built successfully |
| Isolated service deployment | Version 1.3.0 healthy on loopback and all three private-network interfaces |
| Live TypeSafe connection | Pinned `jev-1.13.0` validated; three model-catalog entries returned |
| Live public-opinion decision | Six typed signals returned in 203 ms from 668 input tokens; source provenance retained |

## Deliberately not claimed

- A real TypeSafe credential was validated through encrypted backend storage;
  its value was not printed, logged, or recorded in the repository.
- No attorney-reviewed CourtListener relevance dataset has been completed.
- The displayed relevance bands are experimental UX categories, not approved
  automation thresholds.
- Jev is not a citator, legal writer, summary generator, or source of legal
  authority.
- Proposed opinion navigation, claim checking, context gating, query routing,
  docket classification, and citation-treatment triage are not represented as
  implemented features.

## Promotion gate

Shadow mode remains recommended. Active reranking should not be recommended for
professional reliance until the frozen `search_relevance_noul_v1` contract and
pinned model pass an attorney-reviewed benchmark for ranking quality, recall,
calibration, latency, cost, important slices, and adversarial source text.
