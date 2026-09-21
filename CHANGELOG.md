# Changelog

CourtListenerDash follows [Keep a Changelog](https://keepachangelog.com/) and
uses semantic versions once a release is tagged. Work on `main` is recorded
under **Unreleased** until its production-readiness checks are complete.

## Unreleased

### Added

- Persistent Standard, Large, and Extra large reading modes in the authenticated
  header, stored per browser and available on every workspace.
- A dedicated cross-engine responsive/readability gate covering Chromium,
  Firefox, and WebKit at desktop, laptop, tablet, and phone dimensions.
- Optional TypeSafe Jev System One integration as an independent typed-decision
  service for public CourtListener opinion results, using the official
  JavaScript SDK and pinned `jev-1.13.0` model by default.
- Backend-only Jev API-key entry in Settings with connection validation, live
  model discovery, AES-256-GCM storage, rotation/removal, and no credential
  exposure to the browser.
- Evaluation, shadow-preview, active-experimental, and off modes. Shadow mode
  displays Jev's prospective rank without changing CourtListener order.
- Source-traceable Jev Decision Lens and Research Map for overall research fit,
  legal issue, comparable facts, procedure, directly useful reasoning, and
  distinguishing/limiting language.
- Jev Decision Lab with model/schema version, source boundary, recent decision
  audit, latency, input-token and cost metrics, cache use, and visible
  attorney-evaluation gates.
- Versioned `search_relevance_noul_v1` contract, encrypted configuration,
  bounded concurrency, query/source/schema/model cache, provenance hashes, and
  additive SQLite decision records.
- Offline attorney-reviewed evaluation harness reporting nDCG@10, MRR@10,
  precision@5, recall@10, Brier score, expected calibration error, latency,
  and estimated cost.
- TypeSafe research and architecture record covering appropriate and
  inappropriate Jev uses, security and retention considerations, evaluation
  design, failure behavior, and a prioritized legal-intelligence opportunity
  map.
- Persistent bottom-right Legal Research Assistant that explains the current
  workspace, summarizes allowed current-screen CourtListener material, supports multi-
  turn follow-ups, suggests page-specific questions, and links every displayed
  answer to an exact captured page passage.
- Explicit page-assistant privacy modes: Settings, MCP/API diagnostics, alerts,
  saved research, and RECAP filing text remain outside provider context while
  the assistant can still explain those workflows from reviewed product
  guidance.
- Responsive and accessibility-tested assistant panel with current-page source
  location, truncation notices, one-active-request protection, and an honest
  distinction between a screen snapshot and complete-opinion analysis.
- Ephemeral live-page retrieval index that refreshes as rendered results
  change, inventories safe visible button/link/tab labels, and selects relevant
  passages for each assistant question without storing browsing history.
- Trusted platform-navigation grounding and lawyer-confirmed action links; the
  model can explain or locate a control but cannot click, submit, delete,
  purchase, or mutate anything autonomously.
- Live Ollama model discovery in Settings, with separate paid Ollama Cloud,
  local-service, and compatible-endpoint choices; cloud/local grouping; model
  metadata; and a manual fallback for servers that do not expose a catalog.
- Backend and browser regression coverage for Ollama catalog loading and cloud-
  model selection without returning provider credentials to the frontend.
- Canonical project-state record covering capabilities, integration boundaries,
  verification evidence, known limitations, documentation ownership, and the
  definition of done for future features.
- Repeatable, read-only live MCP audit command with known-record checks and
  account-rate-aware pacing.
- Dedicated oral-argument record workspace with secure CourtListener audio,
  download fallback, linked docket navigation, and transcript search.
- Name-based judicial financial-disclosure discovery.
- User-facing continued-result pagination backed by MCP `get_more_results`.
- Isolated, rate-aware Playwright workflow for live browser acceptance and
  documentation screenshots.
- Educational project README and a reviewed legal-research product-pattern
  record.
- Exact-citation opinion search, including citation-only research without a
  redundant keyword query.
- Portable Docker deployment, local HTTPS proxy, first-run secret generator,
  CI, Dependabot, and generic platform documentation.
- Deterministic, quota-free browser acceptance server and attorney-workflow
  suite for continuous integration.
- Structured citation-verification results for official MCP reports, including
  verified, ambiguous, unresolved, mismatch, candidate, and resumable states.
- Documentation screenshots for citation verification, oral arguments,
  judicial profiles, and public financial disclosures.
- A browser action-coverage ledger that separates route availability from
  accepted controls, configuration-blocked features, and remaining work.
- Prominent README attribution to CourtListener and Free Law Project, together
  with links to the LawNova and Prose project family.

### Changed

- The application version advances to 1.4.1 for the viewport-shell and loaded-
  state UI hardening milestone.
- The authenticated shell now fits the dynamic browser viewport while the
  legal-research pane scrolls independently; route changes return that pane to
  the top instead of preserving an unrelated page position.
- Compact laptops and tablets now use an accessible navigation drawer before
  the permanent sidebar can squeeze legal content. The drawer announces its
  state, closes by button or Escape, leaves no hidden focus targets, and pauses
  background scrolling.
- The responsive gate now waits for fully loaded content across all 22 top-
  level and known-record detail routes, checks viewport height and header
  collisions as well as width, covers high zoom and 320-pixel screens, and
  performs route-wide serious/critical WCAG checks.
- Semantic-search workflow labels and Jev metrics now meet AA contrast, the API
  endpoint selector has an accessible name, and overflowing workspace tabs
  expose a visible local scrollbar.
- Legal metadata, tables, helper text, navigation, Jev intelligence, and the
  page-aware assistant now use a shared readable type scale instead of
  scattered extra-small text.
- Opinions and transcripts use a wider-leading, 78-character reading measure;
  primary controls and navigation use larger touch and keyboard targets.
- Phone headers now keep navigation, usage, reading size, connection state,
  and a full-width global search available without crowding one row.
- Semantic search now preserves its original legal research question and
  explicit intent for the optional Jev relevance decision service.
- Replaced deployment-specific branding, host references, and service
  identifiers with portable CourtListenerDash naming throughout the product,
  documentation, tests, installer, and screenshots.
- Clarified Global Search, Legal Research, and Semantic Search as three distinct
  workflows.
- PACER/RECAP docket workspaces now load tabs on demand to reduce quota use and
  avoid one page opening six upstream calls at once.
- Judge and financial-disclosure workspaces now load one detail tab at a time
  instead of spending five to nine upstream requests on page open.
- Docket workspaces open on a summary overview before loading timeline data.
- Financial-disclosure and RECAP-document ordering now use only live-supported
  CourtListener filters; document-number ordering is applied locally.
- Recoverable detail-view failures now offer a local retry without discarding
  the selected case, docket, judge, report, document, or oral argument.
- Collection-specific search pages now keep their intended collection fixed;
  the unified Legal Research page remains the place to switch datasets.
- Citation-network result lists now link directly to each connected opinion.
- The fixture browser command now builds the current application before it
  starts, preventing stale production assets from weakening acceptance tests.
- New searches and developer requests now clear prior results before loading,
  so an error cannot appear beside a stale successful response.

### Fixed

- Mobile usage details and Jev status labels no longer widen the complete page.
- The compact mobile connection control retains its visible status indicator.
- WebKit no longer upgrades assets on intentional loopback HTTP review servers;
  HTTPS and trusted-proxy deployments retain CSP insecure-request upgrading.
- Fixture password rotation restores the baseline credential so browser-engine
  projects remain isolated and repeatable.
- Bounded Jev evaluation no longer risks dropping CourtListener candidates
  beyond the first 30, including when the TypeSafe provider fails.
- Active Jev mode now rejects moving `latest` and `preview` model aliases so a
  provider release cannot silently change an evaluated production contract.
- TypeSafe authentication, timeout, rate-limit, or provider failures preserve
  the complete original CourtListener result order and show an unavailable
  inference state instead of inventing probabilities.
- Low-contrast model and password helper notes uncovered by the assistant's
  mobile Settings accessibility pass now meet the automated WCAG gate.
- Legal-AI credential reuse is now limited to the same provider and endpoint,
  preventing an encrypted key from being forwarded when an administrator
  changes the configured backend URL.
- Financial disclosures no longer fail because of unsupported `-year`
  ordering.
- RECAP document lists no longer fail because of unsupported
  `document_number` ordering.
- Court-hosted HTTP audio no longer creates a broken mixed-content player when
  CourtListener has preserved an HTTPS copy.
- Judge searches no longer present filing-date filters that CourtListener does
  not support for people records.
- Composite screens now distinguish upstream errors from genuine zero-result
  records.
- CourtListener failures are classified as invalid filters, authentication,
  throttling, timeout, missing records, or temporary unavailability.
- Read-only rate-limited calls use bounded, conservative retries; account-
  changing calls are never retried automatically.
- Hourly and daily account exhaustion now returns immediately with a clear
  allowance-meter instruction instead of appearing to hang.
- Docket court fields no longer expose raw CourtListener REST resource URLs.
- Navigation, activity, and keyboard-hint contrast defects found by automated
  accessibility review were corrected.
- Disclosure tabs, table headings, and responsive controls now pass the suite's
  serious/critical WCAG checks and retain accessible names on mobile.
- RECAP-document search results now open the internal document reader rather
  than a docket route.
- Opinion and document find controls, unified research, alert deletion,
  credential removal, and saved-item deletion now surface recoverable errors.
- Scrollable recent-research history is keyboard accessible.
- Save-authority, save-search, case-save, citation-copy, sign-out, settings,
  MCP inventory, and Saved Research failures now produce recoverable feedback.
- Saved Research no longer describes a failed load as an empty library.
- CourtListener error classification is regression-tested for authentication,
  rate limit, timeout, invalid input, missing record, network outage, and
  unknown upstream failures.

### Verification

- TypeScript checks pass.
- 24 automated tests pass.
- Production browser bundle builds successfully.
- Initial Docker image and GitHub CI builds pass.
- All 19 expected official CourtListener MCP tools were discovered live.
- Known-record live checks passed for judges, disclosures, oral arguments,
  RECAP dockets, entries, documents, parties, attorneys, and schemas.
- Exact 347 U.S. 483 search and the resulting *Brown* workspace passed live
  browser acceptance.
- Private-network and loopback health checks passed after the first CI-gated
  hardening installation.
- The deterministic browser suite passes the primary legal workflow across
  desktop and mobile without spending CourtListener account quota.
- Nine browser acceptances pass: seven Chromium workflows and the focused
  responsive/readability matrix in Firefox and WebKit. The matrix covers
  1440×900, 1024×768, 768×1024, and 390×844 without page-level horizontal
  overflow in representative legal workspaces.
- The supported systemd deployment passed loopback and private-network HTTPS
  health checks.
- Four focused fixture-browser workflows pass in 11 seconds, covering every
  top-level route, mobile navigation, representative primary actions, and
  serious/critical accessibility checks without using CourtListener quota.
- Citation acceptance covers verified, ambiguous, not-found, case-name
  mismatch, pending/resume, and unresolved-short-citation states using the
  official report format.
- The supported deployment workflow served the accepted frontend over
  private-network HTTPS.
- Six focused fixture-browser workflows pass; coverage includes page-aware AI
  grounding and protected-workspace exclusion as well as failure recovery,
  token rotation/removal, insecure AI endpoint rejection, password rotation,
  sign-out, and reauthentication.
- A paid Ollama Cloud credential was verified directly against the official
  model-catalog and chat endpoints without recording the credential; the
  account returned 20 models and completed a minimal `gemma4:31b` response.
- A live `gemma4:31b` page-assistant request extracted the visible *Brown v.
  Board of Education* holding, retained an exact verified source passage,
  disclosed the current-screen limitation, and returned no credential data.
- A live page-RAG request joined a visible opinion-navigation control with the
  displayed *Brown* holding, bound both observations to exact indexed sources,
  preserved the current-page caveat, and returned no credential data.
- The release candidate was installed on a private-network validation host and
  served with the expected security headers.
- The Jev milestone passes 24 backend/security tests and six deterministic
  browser workflows; accepted screenshots cover semantic Decision Lens and the
  Decision Lab without using CourtListener, TypeSafe, or legal-AI quota.
- The synthetic evaluation fixture validates metric calculations only and is
  explicitly excluded from legal-quality claims.
- A backend-held TypeSafe credential and pinned `jev-1.13.0` were live-
  validated without exposing the key. One controlled public *Brown v. Board of
  Education* relevance decision returned six typed signals in 203 ms from 668
  input tokens, retained the source excerpt/hash, and cost an estimated
  $0.000028 at the documented input rate. This connectivity check is not a
  legal-quality benchmark.
- Version 1.4.1 passed 24 backend/security tests, type checks, a zero-finding
  production dependency audit, and nine browser acceptances across Chromium,
  Firefox, and WebKit. The loaded-state Chromium gate covered all 22 top-level
  and known-record detail routes with route-wide WCAG and shell geometry checks.
- The isolated 1.4.1 service and nginx remained active after installation;
  native HTTPS, loopback proxy, and all three configured private-network health
  paths returned HTTP 200 with version 1.4.1.
