# Product hardening audit — 2026-09-19

Status: **In progress**

Milestone: Product hardening and complete integration audit

Environment: Private-network deployment and official hosted CourtListener MCP

Change boundary: Standalone CourtListenerDash application

## Test approach

The cycle combines source inspection, live MCP schema discovery, predictable
public records, automated backend/security tests, production builds, browser
route testing, responsive review, and post-deployment regression checks.

Every feature receives one of these statuses:

- **Verified** — expected data and UI behavior were observed.
- **Fixed; retest pending** — the defect is corrected in source but not yet
  accepted in the deployed browser workflow.
- **Partial** — some layers work and remaining work is stated.
- **Blocked by configuration** — implementation exists but a required optional
  service is not configured.
- **Not tested** — no claim of functionality is made.

## Known-record baseline

| Category | Public test record | Expected evidence | Baseline result |
|---|---|---|---|
| Judge | Sonia Sotomayor, person 3045 | One judge result, profile, positions, education | Live MCP verified |
| Financial disclosure | Sotomayor 2022, disclosure 34207 | Report, PDF, extracted investments/debts/positions | Data verified; progressive UI source-tested; final browser pass pending quota reset |
| RECAP docket | *United States v. Trump*, docket 67490071 | Federal docket and related RECAP collections | Overview and 916-entry timeline browser-verified; document browser pass rate-limited |
| Oral argument | Audio 106409 | Detail metadata, HTTPS MP3, transcript | Data and secure media source verified; final browser playback pass pending |
| Case law | *Brown v. Board of Education*, 347 U.S. 483 | One exact authority and navigable case workspace | Exact-citation search and workspace browser-verified |

## MCP tool inventory

The live official server exposed all 19 expected tools. No expected or unknown
tools were missing on 2026-09-19.

| Category | Tools | Connection | Product status |
|---|---|---:|---|
| Search/retrieval | `search`, `get_counts`, `get_more_results` | Verified | Search and pagination UI implemented; count/continuation live retest pending quota reset |
| Generic REST access | `get_endpoint_schema`, `call_endpoint`, `get_endpoint_item`, `get_choices` | Verified | Invalid filter defects identified and fixed in source |
| Documents | `read_document`, `search_document` | Available | Opinion and RECAP document reading/search pass in fixture browser; expanded live checks remain |
| Citations | `extract_citations`, `analyze_citations`, `resume_citation_analysis` | Available | Official-shaped verified/ambiguous/not-found/mismatch/pending/resume/unresolved browser paths pass; expanded live checks remain |
| Alerts | create/delete search alert; subscribe/unsubscribe docket | Available | Confirmation gate automated; controlled live mutation not yet run |
| RECAP requests | pray/withdraw | Available | Confirmation gate automated; no unnecessary request created |
| Account | `get_api_usage` | Verified | Header usage model active |

## Findings register

| ID | Severity | Area | Finding | Resolution/status |
|---|---|---|---|---|
| PH-001 | High | Financial disclosures | UI used unsupported `order_by=-year`, producing an integration error that looked like no records. | Fixed with supported ordering and local year sort; disclosure categories pass deterministic browser acceptance and live record retrieval passed. |
| PH-002 | High | RECAP documents | UI used unsupported `order_by=document_number`, so document lists failed. | Fixed with local ordering; result routing, list rendering, and document search pass deterministic browser acceptance. |
| PH-003 | High | Oral arguments | Search results rendered HTTP court media inside HTTPS, causing mixed-content playback failure. | Replaced with a detail workspace using CourtListener HTTPS preservation; secure-source/player/transcript UI passes deterministically and actual live playback remains open. |
| PH-004 | High | Reliability | Docket open triggered six upstream calls concurrently against a 10/min account. | Changed to summary-first, tab-on-demand loading. |
| PH-005 | Medium | Search UX | Header, dashboard, research, and collection search appeared to be competing search systems. | Defined three purposes; global entries now run Global Search automatically. |
| PH-006 | Medium | Judges | Generic form exposed filing-date filters that are invalid for people search. | Judge date filters removed; known judge search verified live. |
| PH-007 | Medium | Disclosures | Users needed an internal person ID before they could search reports. | Replaced with judge-name discovery and profile selection. |
| PH-008 | Medium | Error semantics | Composite sections can turn an upstream error object into a “no records” screen. | Fixed; partial errors render as CourtListener availability failures. |
| PH-009 | Medium | Pagination | Continued result pages were available only through the MCP Console. | Fixed in source and route-tested; live continuation retest pending quota reset. |
| PH-010 | Medium | AI case analysis | Provider is not configured in the deployed environment. | Correctly fails closed; functional model evaluation remains blocked by configuration. |
| PH-011 | High | Quota reliability | Judge/disclosure pages opened five to nine concurrent upstream calls. | Fixed with profile-first and tab-on-demand loading. |
| PH-012 | Medium | Rate-limit recovery | Retrying at CourtListener's short 10/min estimate can stay inside the rolling window, while waiting on an exhausted hourly or daily window makes the UI appear stuck. | Fixed: minute throttles use one conservative bounded wait; hourly/daily throttles return immediately with a plain-language header-meter instruction; mutations never retry. |
| PH-013 | High | Exact authority selection | A partial Brown title assertion opened a different Supreme Court case ranked first. | Fixed and browser-verified with exact citation 347 U.S. 483 and the complete CourtListener caption. |
| PH-014 | Medium | Accessibility | Automated browser review found insufficient contrast in navigation labels, the global-search keyboard hint, activity timestamps, inactive workspace tabs, disclosure text, and table headings. Mobile menu/connection controls also lost their accessible names when visible text collapsed. | Fixed and accepted by desktop/mobile WCAG axe checks in the deterministic browser suite. |
| PH-015 | Low | Docket presentation | Court metadata could render as a raw REST resource URL. | Fixed with a readable court-name/code formatter; deterministic browser acceptance passed. Live screenshot refresh remains open. |
| PH-016 | Medium | Recovery UX | Transient failures in case, opinion, docket, audio, judge, and disclosure detail screens had no direct retry action. | Fixed in source with local retry controls that do not reload unrelated modules. |
| PH-017 | High | Citation verification | The UI exposed the official MCP citation-analysis report as raw output and the deterministic fixture used an inaccurate JSON shortcut. | Fixed: the fixture follows the official formatted report and the UI presents verified, ambiguous, unresolved, mismatch, candidate, and pending states with source links and raw-report disclosure. |
| PH-018 | Medium | Search architecture | Collection-specific pages still exposed a collection selector, allowing Cases, Dockets, Oral Arguments, or Judges to turn into a different search workflow. | Fixed: focused pages lock and label their collection; only Legal Research switches datasets. |
| PH-019 | Medium | Navigation | RECAP-document results opened a docket route, and citation-network tables did not provide ordinary case links. | Fixed with internal document-reader routing and navigable authority lists. |
| PH-020 | Medium | Regression reliability | Fixture browser acceptance could serve a stale production bundle, while one monolithic test obscured failures. | Fixed: the command always builds first and runs four focused serial workflows. |
| PH-021 | Medium | Accessibility | The mobile dashboard's scrollable research history could not receive keyboard focus. | Fixed with an accessible, focusable scroll region and accepted by the narrow-viewport axe check. |
| PH-022 | Medium | Local actions | Save/search/case/copy and sign-out failures could reject without visible recovery. | Fixed with attorney-facing notices and clipboard fallback guidance. |
| PH-023 | Medium | Developer tools | MCP Console and API Explorer retained stale successful output after a newer malformed request failed. | Fixed: result/timing state clears at request start; browser acceptance verifies the prior 200/response disappears. |
| PH-024 | Medium | Empty-state accuracy | Saved Research could describe a request failure as an empty library; Settings and MCP inventory load failures were underreported. | Fixed with explicit availability banners and retry where applicable. |
| PH-025 | Medium | Error taxonomy | Only hourly throttling had direct automated response-code coverage. | Fixed: authentication, rate-limit, timeout, invalid-filter, missing-record, network-outage, and generic-failure mappings are automated. |

## Module acceptance matrix

| Module | Backend | Known data | UI | Errors | Current status |
|---|---:|---:|---:|---:|---|
| Global Search | Yes | Fixture | Browser verified | Improved | Cross-collection fixture pass; broader live ranking review remains |
| Legal Research | Yes | Live + fixture | Browser verified | Improved | Exact citation, court choice, pagination, and fixed-collection paths accepted |
| Semantic Search | Yes | Fixture | Browser verified | Improved | Intent-preserving grounded workflow accepted; live ranking review remains |
| Cases/opinions | Yes | Live + fixture | Browser verified | Improved | Case, opinion find, parties, cited authority, and save/remove pass |
| PACER/RECAP | Yes | Live + fixture | Browser verified | Improved | Overview, timeline, documents, parties, attorneys, oral records, and internal document reader pass |
| Citation network | Yes | Fixture | Browser verified | Improved | Graph and navigable cited/citing authority lists pass |
| Citation verification | Yes | Official-shaped fixture | Browser verified | Improved | Structured verified-authority path passes; live ambiguity/pending samples remain |
| Oral arguments | Yes | Live metadata + fixture UI | Browser verified | Improved | Secure source, player, fallback, transcript find, and linked docket pass; actual live playback remains |
| Judges | Yes | Live + fixture | Browser verified | Improved | Profile, appointments, education, affiliations, and disclosure route pass |
| Financial disclosures | Yes | Live + fixture | Browser verified | Improved | Report categories, empty states, investments, and source-PDF control pass |
| Alerts | Yes | Fixture account state | Browser verified | Improved | Create/delete confirmation path passes; unnecessary live mutation not performed |
| MCP Console | Yes | Live inventory + fixture call | Browser verified | Yes | All 19 tools listed and a call result accepted; expanded input audit open |
| API Explorer | Yes | Live schemas + fixture call | Browser verified | Improved | Schema display and read-only request pass; endpoint-by-endpoint audit open |
| Settings/security | Yes | Automated + fixture | Browser verified | Improved | Token/password controls and insecure AI endpoint pass; approved provider and backup/restore drills remain |

## Security and reliability review

The source and deployed configuration were reviewed at the browser, application,
credential-storage, and external-service boundaries.

| Control | Evidence | Status |
|---|---|---|
| Authentication boundary | All `/api` routes except sign-in status/login require a signed server-side session; `/healthz` contains no sensitive data. | Verified in source and automated tests |
| Request forgery protection | State-changing application routes require the session's timing-safe CSRF token. | Verified in source and automated tests |
| Login resistance | Passwords use scrypt; repeated failures are limited per source for 15 minutes; password changes revoke other sessions. | Verified in source |
| Credential handling | CourtListener and optional AI keys use AES-256-GCM, atomic `0600` files, and backend-only transport. | Verified by tests and source review |
| Browser content boundary | CSP blocks third-party scripts/frames; media and downloadable-document helpers allow only secure CourtListener hosts. | Verified by tests and source review |
| External mutations | Alert, docket-monitoring, and RECAP prayer tools require a short-lived, session-bound, argument-bound confirmation. | Verified by automated test; no unnecessary live mutation performed |
| Diagnostic redaction | Tool arguments, results, provider failures, and stored diagnostic events redact credential-like fields. | Verified by automated tests and source review |
| Optional AI endpoint | Only an authenticated administrator can configure it; non-loopback endpoints require HTTPS. Opinion text is sent to that administrator-selected provider. | Accepted administrative trust boundary; use only a practice-approved provider |
| Local service rate limit | Per-client API requests are bounded and CourtListener minute/hour/day failures are distinguished. | Verified by source and automated tests |
| Deterministic browser regression | A CourtListener-shaped fixture server exercises real authentication, routes, backend handlers, legal workspaces, mobile navigation, and accessibility without using account quota. | Passed across the complete primary-workspace suite |

The audit was limited to the standalone application and its documented
deployment resources.

## Release blockers for this milestone

- Complete the open rows in the action-coverage ledger, prioritizing case
  toolbar, embedded case tabs, disclosure discovery, and multi-chunk documents.
- Complete live pagination continuation after the hourly quota resets.
- Complete selected live known-case citation, document, RECAP, and oral playback
  checks without exhausting the account allowance.
- Extend responsive checks beyond the accepted desktop and narrow mobile
  representative workspaces.
- Verify the CourtListenerDash service, private-network access, and settings
  after deployment.

## Browser evidence captured

The isolated loopback review server uses a temporary password/database and the
existing backend-only encrypted credential. It does not modify the deployed
service.

- Dashboard and account-allowance header: passed and captured.
- Exact-citation opinion search for 347 U.S. 483: passed and captured.
- Exact *Brown* case workspace and grounded-analysis disabled state: passed
  and captured.
- RECAP docket overview: passed and captured.
- RECAP chronological timeline: passed with 916 known entries and captured.
- RECAP document browser: endpoint passed in the read-only MCP audit, but the
  later browser attempt reached the account's rolling 10/min limit.
- Oral argument, judge tabs, and disclosure tabs: deferred once only 24 hourly
  requests remained. This is a quota-protection decision, not a pass claim.
- Axe browser checks found three contrast defects; all three are fixed in
  source. The later live run stopped at the exhausted 100/hour rolling window
  and did not report an application crash.
- A quota-free deterministic suite now passes five focused workflows in about
  13 seconds: sign-in, allowance display, global/exact/continued search,
  case/opinion/citation/party/save workflow, semantic intent, docket overview,
  timeline/documents/participants/counsel, internal document reading,
  audio/transcript, judge profile and related tabs, disclosure categories,
  structured citation verification, citation graph links, alert create/delete,
  ambiguous/not-found/mismatch/pending/resumed/unresolved citation states,
  all 19-tool MCP inventory and a tool call, API Explorer, every top-level
  route, responsive navigation, and desktop/mobile serious/critical WCAG
  checks.
- The fifth workflow verifies temporary-outage retry, failed local-save
  feedback, malformed MCP/API input without stale success, token
  rotation/removal, insecure AI-endpoint rejection, password rotation,
  sign-out, and reauthentication.
- QA-accepted screenshots now document citation verification, oral arguments,
  a judicial profile, and a public financial-disclosure report without
  consuming the live account allowance.

## Deployment regression evidence

The accepted release candidate passed both GitHub verification jobs and was
installed through the CourtListenerDash systemd installer on 2026-09-20. After
installation:

- `courtlistener-web.service` was active and enabled.
- Loopback health returned version 1.2.0.
- Private-network health at `https://<LAN-HOST>/healthz` returned healthy.
- The private-network dashboard route returned HTTP 200 through nginx with the
  expected security headers.
- The validation host served the accepted frontend bundle.

The deployed revision includes the deterministic browser suite, accessibility
repairs, friendly court labels, local recovery controls, bounded hour/day-limit
behavior, official-format structured citation verification, focused collection
search, navigable citation/document routes, action-level error recovery, and
administrative credential/password acceptance. A brief connection refusal
inside the installer's immediate restart probe was confined to the application
restart window; both listeners and the private-network route were healthy during the
acceptance check.

## Repeatable commands

Local checks do not spend CourtListener allowance:

```bash
npm run check
npm test
npm run build
npm audit --omit=dev
npm run test:e2e:fixture
```

The live MCP audit must be run only when the account has sufficient hourly and
daily allowance:

```bash
sudo env COURTLISTENER_LIVE_AUDIT=1 \
  COURTLISTENER_ENV_FILE=/etc/courtlistener-web/app.env \
  COURTLISTENER_AUDIT_REPORT=docs/qa/live-mcp-audit.json \
  node scripts/audit-live.mjs
```

The browser acceptance suite is opt-in and requires an isolated review server;
its password is temporary and unrelated to the deployed dashboard password.

Documentation screenshots can be refreshed from the same quota-free accepted
workflow:

```bash
COURTLISTENER_CAPTURE_SCREENSHOTS=1 npm run test:e2e:fixture
```
