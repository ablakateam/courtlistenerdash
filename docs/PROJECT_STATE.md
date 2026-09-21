# CourtListenerDash project state

Last reviewed: **2026-09-20**<br>
Application version: **1.4.1**<br>
Lifecycle: **Public preview and active product hardening**

This is the canonical handoff record for the project. Read it before planning a
feature, and update it whenever a change alters a capability, integration,
security boundary, deployment requirement, or known limitation.

## Project identity

CourtListenerDash is a standalone, self-hosted legal-research and litigation-
intelligence application powered by CourtListener. It belongs to the
[LawNova](https://lawnova.pro/) project family and is developed alongside
[Prose by LawNova](https://prose.lawnova.pro/).

CourtListener and the Free Law Project supply the public legal infrastructure
that makes this product possible. CourtListenerDash is independent and is not
an official CourtListener or Free Law Project product.

Public repository: <https://github.com/ablakateam/courtlistenerdash>

## Product contract

These rules are architectural requirements, not optional design preferences:

1. **CourtListener grounds legal authority.** Cases, citations, opinions,
   dockets, filings, oral arguments, judges, and disclosures displayed as legal
   records must resolve to CourtListener data or another source explicitly
   approved and labeled in the future.
2. **AI never invents authority.** AI may organize retrieved text, explain why
   a result is relevant, and draft a source-linked analysis. It may not supply
   case names or citations from model memory as if CourtListener verified them.
3. **Major conclusions remain traceable.** Holdings, rules, facts, reasoning,
   and quotations produced by optional AI analysis must link to an exact
   retrieved source passage. Unsupported claims fail closed.
4. **Search purposes stay distinct.** Global Search is a broad starting point;
   Legal Research is structured keyword search; Semantic Search preserves a
   natural-language legal research intent. Collection pages are focused entry
   points, not competing search systems.
5. **Credentials stay on the backend.** CourtListener and optional AI keys are
   encrypted at rest and are never returned to or embedded in the browser.
6. **External mutations require confirmation.** Alert changes, docket-monitor
   changes, and RECAP Pray and Pay requests use a short-lived confirmation tied
   to the exact tool and arguments. They are never retried automatically.
7. **CourtListener quotas shape the interface.** Composite records load one
   section at a time, read-only retries are bounded, and minute, hour, and day
   exhaustion are presented as different states.
8. **The deployment remains portable.** Docker Compose and systemd deployment
   are supported without dependence on another application. The default model
   is authenticated private-network access, not an open internet port.
9. **The UI must not imply unavailable functionality.** Empty data, unsupported
   operations, upstream failures, and unconfigured optional providers are
   visibly different states.
10. **Legal reading must remain legible.** Shared text scales, bounded reading
    measures, persistent enlargement, visible focus, and responsive containment
    are part of the product contract rather than optional visual polish.

## Capability baseline

| Product area | Current state | Important boundary |
|---|---|---|
| Dashboard | Implemented and browser-tested | Shows connection health, request allowance, recent work, and saved research. |
| Reading and responsive interface | Implemented and cross-engine tested | The application shell fits the visible viewport and the legal-research pane scrolls independently. Standard, Large, and Extra large modes persist per browser; all 22 loaded routes pass the Chromium shell/contrast audit and representative workspaces pass desktop, laptop, tablet, high-zoom, and phone containment in Chromium, Firefox, and WebKit. |
| Global Search | Implemented and browser-tested | Keeps incompatible CourtListener result types in separate tabs. |
| Legal Research | Implemented and browser-tested | Uses collection-specific, schema-supported filters and CourtListener court choices. |
| Semantic Search | Implemented and browser-tested | Searches CourtListener opinions semantically while preserving explicit research intent. |
| Jev decision intelligence | Experimental prototype implemented; attorney evaluation required | Optional TypeSafe service reranks only public CourtListener opinion candidates. Shadow mode preserves CourtListener order; provider failure fails open; typed signals are labeled model inferences. |
| Jev Decision Lab | Implemented | Shows model/schema version, source boundary, modes, latency, input-token cost, cache use, recent decisions, and evaluation gates without exposing the API key. |
| Cases and opinions | Implemented and browser-tested | Consolidated workspace includes metadata, opinion reading, parties, authorities, related opinions, docket links, and oral records where available. |
| AI case analysis | Implemented; provider configuration required | Long opinions are processed in sections; only source-linked conclusions render. Settings discovers and groups live Ollama Cloud/local models without exposing the key. No provider key is bundled. |
| Page-aware legal assistant | Implemented, browser-tested, and live-provider tested | Persistent helper builds an ephemeral live index of rendered text and safe action labels, retrieves question-relevant passages, explains workspaces and navigation, and returns exact sources. A visible research query may be included; protected routes exclude their page bodies. It cannot operate controls, and current-screen answers are not complete-document reviews. |
| PACER/RECAP research | Implemented and browser-tested | Searches CourtListener's RECAP archive and presents dockets, entries, parties, attorneys, documents, attachments, and available PDFs. Coverage may be incomplete. |
| Paid PACER Fetch | **Not implemented** | Direct PACER credential submission and paid purchasing through `/recap-fetch/` require a separate security, fee-confirmation, sealed-record, and status-monitoring design. Read-only fetch records remain inspectable through generic MCP endpoints. |
| RECAP Pray and Pay | Implemented behind explicit confirmation | Requests notification when an unavailable document is later contributed; it does not purchase the document. |
| Citation network | Implemented and browser-tested | Shows cited and citing authorities; relationships are not editorial treatment signals. |
| Citation verification | Implemented and browser-tested | Distinguishes verified, ambiguous, unresolved, mismatch, candidate, and resumable states. It is not a good-law citator. |
| Oral arguments | Implemented and browser-tested | Resolves CourtListener-hosted HTTPS audio, download fallback, transcript search, and linked docket information. |
| Judges | Implemented and browser-tested | Biography, appointments, education, affiliations, and related records load progressively. |
| Financial disclosures | Implemented and browser-tested | Presents public records factually and links source documents; it does not infer conflicts. |
| Alerts | Implemented with confirmation gates | Uses CourtListener's server-side search and docket alerts rather than duplicating monitoring locally. |
| MCP Console | Implemented and browser-tested | Exposes tool inventory, schemas, arguments, duration, response, and errors for authenticated administrators. |
| API Explorer | Implemented and browser-tested | Exposes read-only MCP-backed CourtListener endpoint list/item operations; it is not an arbitrary HTTP client. |

## CourtListener integration baseline

- The reviewed official MCP inventory contains **19 tools**. Every tool is
  represented in the product or technical console and recorded in the
  [tool inventory](MCP_TOOL_INVENTORY.md) and
  [coverage matrix](MCP_COVERAGE_MATRIX.md).
- Court and jurisdiction controls use CourtListener-provided choices rather
  than sending unvalidated natural-language values as court identifiers.
- CourtListener remains the authority for supported schemas, choices, search
  types, pagination, record identifiers, and usage limits.
- PACER data in ordinary research means PACER-derived material available in the
  public RECAP archive. Direct paid retrieval from PACER is a distinct future
  capability and must not be implied by the existing interface.
- Live integration checks use known public records and are deliberately paced
  around the connected account's minute, hour, and daily allowance.

## Persistence and security baseline

The application stores the administrator password hash, encrypted service
configuration, saved research, activity summaries, and cached case analyses in
its dedicated data directory. It does not commit runtime credentials or data to
Git.

The current security baseline includes:

- scrypt administrator-password hashing;
- signed HTTP-only same-site sessions and separate CSRF protection;
- AES-256-GCM encryption for CourtListener and optional AI credentials;
- separate AES-256-GCM encryption for the optional TypeSafe API key;
- backend-only credential transport and diagnostic redaction;
- endpoint-bound provider-key reuse and backend-only Ollama model discovery;
- rate limiting for local authentication and API routes;
- restricted secure CourtListener media/document URLs;
- HTTPS-oriented private-network deployment;
- confirmation challenges for every known state-changing MCP tool;
- GitHub secret scanning, push protection, vulnerability alerts, and automated
  dependency-security updates.

See [SECURITY.md](../SECURITY.md) for the complete security model.

## Verification baseline

| Gate | Accepted baseline |
|---|---|
| Type safety | Client and server TypeScript checks pass. |
| Backend/security regression | 24 automated tests pass, including Jev encryption, reranking, provenance, cache, usage accounting, pinned-model enforcement, and fail-open result preservation. |
| Deterministic browser acceptance | Nine accepted tests pass against CourtListener-shaped fixture data without spending CourtListener or AI-provider quota. |
| Browser scope | Six complete product workflows and the responsive matrix run in Chromium; the focused readability/containment matrix also runs in Firefox and WebKit. The loaded-state layout gate covers all 22 top-level and known-record detail routes at common laptop, compact laptop, and phone dimensions, plus representative wide-desktop, tablet, high-zoom, and minimum-phone checks. Coverage also includes authentication, primary research, public records, citation/alert/developer tools, mobile-drawer keyboard behavior, recovery, optional-provider settings, assistant grounding, and protected-context exclusion. |
| Accessibility | Representative desktop and mobile workspaces have no serious or critical automated WCAG findings; standard legal metadata samples at ≥13px, supporting text at ≥14px, and opinion text at ≥17px. |
| Production build | Vite client and Node server build successfully. |
| Container | The production Docker image builds in GitHub Actions. |
| Dependency audit | Production dependency audit passes in CI. |
| Public repository | One clean release baseline was published without development-history or credential exposure. |

The detailed action ledger is maintained in
[ACTION_COVERAGE.md](qa/ACTION_COVERAGE.md). A green deterministic suite does
not replace deliberately paced live CourtListener acceptance.

## Known limitations and open decisions

- CourtListener and RECAP coverage is broad but incomplete. “Not located” is
  never presented as proof that a record does not exist.
- Citation resolution and citation relationships do not establish positive or
  negative treatment or current-law status.
- Direct paid PACER Fetch is not implemented.
- Optional AI analysis requires an administrator-approved provider and data-
  governance decision.
- Jev relevance ranking is experimental. A backend-held credential, pinned
  `jev-1.13.0`, model catalog, and one source-retaining public-opinion decision
  were live-verified on 2026-09-20. No attorney-reviewed CourtListener
  benchmark has been completed, so shadow mode remains the recommended
  operating state and no probability should be read as legal correctness.
- Paid Ollama Cloud was live-verified on 2026-09-20 through its official model
  catalog and chat APIs. Account billing and limits remain external to this
  application; a successful paid-account probe is not a promise of unlimited
  capacity.
- Page-aware assistant quality was live-verified with a public *Brown v. Board
  of Education* excerpt: `gemma4:31b` returned the visible holding with an exact
  validated passage and the current-screen limitation. The live page-RAG
  follow-up also grounded an opinion-navigation action and the holding in two
  separate exact indexed sources without returning credential data.
- Remaining live, native-device, performance, and action-level acceptance work is
  tracked in the [roadmap](ROADMAP.md) and public issue tracker.
- Native assistive-technology checks on physical Apple, Windows, and Android
  devices remain a release-readiness complement to the accepted automated
  Chromium, Firefox, and WebKit matrix.
- A formal open-source license has not been selected. Public visibility alone
  does not grant permission to copy, modify, or redistribute the project.

## Current public work queue

- [Issue 1 — Complete responsive, accessibility, screenshot, and README pass](https://github.com/ablakateam/courtlistenerdash/issues/1)
- [Issue 2 — Verify complete case, citation, and document research flow](https://github.com/ablakateam/courtlistenerdash/issues/2)
- [Issue 3 — Finish PACER/RECAP workspace verification](https://github.com/ablakateam/courtlistenerdash/issues/3)
- [Issue 4 — Add normal-workflow pagination and explicit rate-limit handling](https://github.com/ablakateam/courtlistenerdash/issues/4)
- [Issue 5 — Complete route-by-route browser and legal workflow audit](https://github.com/ablakateam/courtlistenerdash/issues/5)

## Feature-change protocol

Every new feature should follow this sequence:

1. State the lawyer's or researcher's concrete objective and how the feature
   saves time, improves verification, or clarifies legal context.
2. Map the feature to the official CourtListener MCP tool, endpoint schema,
   REST resource, or explicitly approved external source before designing UI.
3. Record read/write behavior, credentials, confidential data, fees, quota
   impact, pagination, caching, and failure modes.
4. Implement additively within the existing boundaries and avoid creating a
   duplicate workflow.
5. Add unit or security tests for backend behavior and deterministic browser
   acceptance for every visible success, empty, loading, and error state.
6. Perform a proportionate live known-record check when the external contract
   matters, without exhausting or mutating the connected account unnecessarily.
7. Update this document, the changelog, roadmap, action ledger, relevant MCP
   records, deployment/security docs, and screenshots when affected.
8. Require passing type, unit/security, browser, dependency, and container
   checks before merge or deployment.

## Definition of done

A feature is not complete merely because an endpoint returned HTTP 200. It is
complete when:

- the legal-user purpose is understandable;
- the source and data limitations are visible;
- the complete ordinary workflow works without raw API knowledge;
- supported filters and identifiers are validated against CourtListener;
- loading, empty, success, throttled, authentication, unavailable, and invalid-
  input states are handled where applicable;
- state changes require explicit confirmation and are not automatically
  retried;
- credentials and sensitive configuration remain backend-only;
- deterministic regression coverage passes;
- live behavior is checked when appropriate;
- accessibility and responsive behavior remain acceptable;
- documentation and project-state records match the implementation; and
- existing working research and deployment workflows remain intact.

## Documentation ownership

| Record | Update when |
|---|---|
| This project-state file | A capability, boundary, verification count, limitation, or release decision changes. |
| [CHANGELOG.md](../CHANGELOG.md) | Any user-visible or operational behavior changes. |
| [ROADMAP.md](ROADMAP.md) | A milestone changes state or scope. |
| [LESSONS_LEARNED.md](LESSONS_LEARNED.md) | A finding changes engineering or release practice. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Data flow, persistence, trust, service, or integration boundaries change. |
| MCP inventory and coverage matrix | CourtListener adds, removes, or changes a tool or endpoint mapping. |
| QA audit and action ledger | A route, action, known record, or acceptance result changes. |
| README and screenshots | Installation, public positioning, or a primary user workflow changes. |
