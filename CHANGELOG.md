# Changelog

CourtListenerDash follows [Keep a Changelog](https://keepachangelog.com/) and
uses semantic versions once a release is tagged. Work on `main` is recorded
under **Unreleased** until its production-readiness checks are complete.

## Unreleased

### Added

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
- 18 automated tests pass.
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
- Five focused fixture-browser workflows pass in about 13 seconds; the new
  workflow covers failure recovery, token rotation/removal, insecure AI
  endpoint rejection, password rotation, sign-out, and reauthentication.
- A paid Ollama Cloud credential was verified directly against the official
  model-catalog and chat endpoints without recording the credential; the
  account returned 20 models and completed a minimal `gemma4:31b` response.
- The release candidate was installed on a private-network validation host and
  served with the expected security headers.
