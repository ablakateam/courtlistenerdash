# Lessons learned

This is a living engineering record. Each lesson should change implementation,
testing, or release practice rather than merely describe an incident.

## 2026-09-19 — Runtime schemas are the integration contract

CourtListener exposes an endpoint field without necessarily accepting every
intuitive ordering. `financial-disclosures` does not support `-year`, and
`recap-documents` does not support `document_number` ordering. Both produced
valid-looking UI paths that always ended in empty screens.

Action: validate every filter through `get_endpoint_schema` or `get_choices`,
keep a known-record test, and perform unsupported presentation sorting locally.

## 2026-09-19 — Empty data and broken integration are different states

Known Sonia Sotomayor records proved that judge and disclosure data existed.
The disclosure screen was empty because its request was invalid, not because
CourtListener lacked records.

Action: composite views must retain section errors and label them separately
from a genuine zero-result response.

## 2026-09-19 — Search records are not detail records

Oral-argument search results carry an original court download URL but not the
CourtListener-preserved MP3 path. The original URL may use HTTP and becomes
mixed content inside an HTTPS dashboard. The audio detail record contains the
secure CourtListener storage path and transcript.

Action: search results navigate to a dedicated detail workspace; the workspace
resolves the secure preserved media before rendering a player.

## 2026-09-19 — Account limits are a product constraint

The connected account allows 10 requests per minute. A docket page that loaded
docket metadata, entries, documents, parties, attorneys, and audio at once
spent most of that allowance before the user selected a tab.

Action: progressively load composite workspaces, cache read-only results, pace
live audit calls, and expose rate-limit errors as a temporary availability
condition rather than “no data.”

## 2026-09-19 — Known records belong in every integration audit

Predictable public records separated integration failures from sparse data:
Sonia Sotomayor (person 3045), her 2022 disclosure (34207), a RECAP federal
docket for *United States v. Trump* (67490071), and an oral argument with a
CourtListener MP3 and transcript (106409).

Action: keep these as public smoke-test anchors while avoiding assumptions
about search ranking or completeness.

## 2026-09-19 — A throttled retry can extend a rolling limit

CourtListener's 10/min response can include a short estimated wait. Browser
testing showed that retrying at that boundary could be counted inside the same
rolling window and return another 429.

Action: read-only operations may retry only after a conservative full-minute
wait, with a strict retry bound and diagnostic count. Account-changing tools
are never retried automatically. Live audits stop before exhausting the hourly
or daily allowance.

## 2026-09-19 — A familiar case name is not an exact case identifier

A Supreme Court search for “Brown v. Board of Education” returned hundreds of
results and ranked a later case containing similar words first. A partial-title
browser assertion opened the wrong authority even though every technical link
worked.

Action: exact-citation searches need a distinct route and acceptance state.
Known-case tests must assert the complete caption/citation or fixed public
record identifier rather than choose the first partial title match.

## 2026-09-19 — Rate limits are three independent product states

A free minute window does not mean the account has hourly or daily capacity.
The browser suite reached 100/100 for the rolling hour while the minute meter
had already recovered. Automatically waiting on that hourly response made a
working page look like an endless spinner and further probes risked extending
the rolling window.

Action: retry only a clearly identified minute throttle, once the full minute
has cleared. Return hourly and daily exhaustion immediately, name the exhausted
window, and direct the user to the allowance meter. Schedule live acceptance
work around all three windows rather than looking only at requests per minute.

## 2026-09-19 — Technical identifiers should not leak into the research view

The RECAP docket API returned the court as a REST resource URL. The data was
correct, but showing that URL in a prominent court field made a polished legal
workspace feel like an API inspector.

Action: preserve raw identifiers under Technical Data while translating court
resources into an available court name or readable code in the ordinary legal
workflow.

## 2026-09-19 — An error message still needs a recovery path

Friendly error classification prevented raw exceptions, but detail pages still
required a full browser refresh after a temporary outage or account throttle.

Action: each independently loaded legal module must offer a local retry that
does not discard the current case, tab, or research context.

## 2026-09-19 — Live acceptance and continuous regression are different jobs

Known-record browser tests prove the hosted CourtListener integration, but they
also spend a small account's minute, hour, and daily allowance. Running them on
every push would either exhaust the account or encourage shallow testing.

Action: keep a CourtListener-shaped deterministic server for continuous browser
acceptance of the real UI and backend routes. Run a smaller live known-record
suite deliberately to verify the external contract, secure media, and actual
data. Neither layer replaces the other.

## 2026-09-19 — Responsive accessibility can fail after desktop passes

When the mobile layout hid visible control text, the menu and connection
controls lost their accessible names. Disclosure tabs and table headings also
revealed contrast defects not present on the initial dashboard screen.

Action: run automated accessibility checks on representative deep workspaces
and a narrow viewport, not only the landing page. Icon-only controls require an
explicit accessible name that survives responsive CSS.

## 2026-09-20 — The official MCP output shape must drive the fixture

`analyze_citations` returns a human-readable report containing extraction,
verification, status, candidate, and resumable-job lines. An earlier fixture
returned convenient JSON, which proved the page could render data but not that
it understood the official server's response.

Action: derive contract fixtures from the reviewed official MCP implementation.
Parse its report defensively into lawyer-facing states while retaining the raw
report under technical details. Never infer that a recognized citation is a
verified authority.

## 2026-09-20 — A browser gate must build what it tests

The fixture server serves the production `dist` directory. Running Playwright
without rebuilding could exercise yesterday's bundle while the current source
appeared green.

Action: the fixture acceptance command always creates a fresh production build
before starting the server; CI calls that single command so local and hosted
gates cannot drift.

## 2026-09-20 — Long end-to-end stories hide the point of failure

One large attorney-workflow test became slow to diagnose and caused later
modules to be skipped after a small selector failure. Accessibility frame
discovery also stalled even though CourtListenerDash does not use frames.

Action: keep one serial fixture environment but split acceptance into focused
research, public-record, developer, and navigation workflows. Use axe's
single-page legacy mode for this frame-free SPA and continue enforcing serious
and critical WCAG findings.

## 2026-09-20 — A visible scrollbar is a keyboard contract

The narrow-viewport audit found that recent research became scrollable but the
region itself could not receive keyboard focus in Safari.

Action: any deliberately scrollable content region must either contain a
focusable control or expose an accessible label and keyboard focus target.

## 2026-09-20 — Route coverage is not action coverage

Every navigation destination rendered, but that did not prove that saving,
copying, credential rotation, malformed developer input, or sign-out recovered
cleanly. Several rejected promises were visible only in the browser console.

Action: maintain a control-level acceptance ledger. A page earns route credit
when it renders and action credit only when the control's success, cancellation,
or error state has been observed.

## 2026-09-20 — A stale success beside an error is misleading

The API Explorer and MCP Console retained an earlier successful response while
a newer malformed request displayed an error. Both messages were individually
true, but their combination could cause the wrong request to appear successful.

Action: clear result and timing state at the start of a new operation. On
failure, show only the failure and an explicit recovery path.

## 2026-09-20 — Public release hygiene includes unreachable history

Removing a file from the current branch or force-pushing a new root does not
guarantee that earlier objects are immediately unreachable through a hosting
provider. A repository can look clean in ordinary navigation while an earlier
commit remains accessible to somebody who knows its identifier.

Action: when development history is intentionally private, publish from a clean
repository object database, verify prior identifiers without authentication,
and retain the detailed history only in a protected private archive.

## 2026-09-20 — Repository automation starts before publication

Dependency automation can run and open update pull requests as soon as its
configuration lands in a newly created repository, even while the repository
is still being prepared.

Action: update supported dependencies and encode intentional major-version
holds before the final repository is created. Delete transient preparation runs
and verify the public repository's issues, pull requests, refs, and Actions
history as part of the release gate.

## 2026-09-20 — Project memory needs one canonical handoff

A roadmap, changelog, architecture record, tool inventory, and QA ledger answer
different questions. Without a canonical current-state document, a future
feature can be designed from an outdated fragment or silently cross a security
or product boundary.

Action: maintain `docs/PROJECT_STATE.md` as the current handoff. Every feature
must update it when capabilities, boundaries, verification evidence, known
limitations, or release decisions change.

## 2026-09-20 — Ollama Cloud has two valid connection paths

A local Ollama catalog can retain cloud shortcut entries even when the local
service's cloud authentication no longer succeeds. On the validation host,
`/api/tags` listed two cloud shortcuts while chat returned `Unauthorized`; the
same backend-held key successfully listed 20 models and completed a minimal
chat through the direct `https://ollama.com/api` path.

Action: present direct Ollama Cloud and local Ollama as distinct connection
choices, discover models from the endpoint that will actually run them, and
validate a selected model before saving. A catalog entry alone is not evidence
that inference works.

## 2026-09-20 — A page assistant is not a complete-document analyst

A persistent assistant can see what the lawyer sees and reduce navigation and
orientation time, but a browser page may contain only one document chunk, one
selected tab, or a size-limited snapshot. Calling that a full case summary
would recreate the truncation problem the long-opinion pipeline was designed
to avoid.

Action: label assistant responses as current-page answers, report snapshot
reduction, and keep complete-opinion analysis as a separate section-by-section
workflow with complete-coverage evidence.

## 2026-09-20 — Page awareness needs a server-enforced privacy map

Removing password inputs from a DOM snapshot is not enough. Settings, saved
research, alert queries, raw diagnostics, and filing text can reveal secrets,
strategy, or material outside the approved provider boundary. A malicious or
defective browser also cannot be trusted to label a route protected.

Action: maintain an explicit route policy on both sides. Index only the allowed
research area while the assistant is open, send context only after an
intentional question, strip form values and technical output in the browser,
and have the backend discard all submitted page text for protected routes
before calling the provider.

## 2026-09-20 — Page context needs structure, not only text

A flat DOM text dump can summarize visible prose, but it does not reliably tell
the assistant which controls exist, where they lead, or which part of a long
screen answers the question. Sending the complete page on every turn also adds
latency and provider cost without improving a focused navigation answer.

Action: maintain an ephemeral index of rendered text and safe action labels,
refresh it as the research view changes, and retrieve only the most relevant
passages for each question. Keep typed values and protected workspaces outside
the index, use a reviewed server-side map for platform navigation, and require
the lawyer to activate every suggested control.

## 2026-09-20 — A probability is useful only with its contract and provenance

A polished confidence display can make an experimental model judgment appear
more authoritative than it is. A Jev Noul probability answers one precisely
worded question against one supplied state; it is not a percentage chance that
a case is “correct,” controlling, or still good law. Changing the question,
passage, taxonomy, or model changes the decision contract.

Action: show every probability as model inference beside the CourtListener
source, keep both original and assisted rank, version schemas and models, retain
the evaluated excerpt and hash, and select automation thresholds only from an
attorney-reviewed calibration dataset.

## 2026-09-20 — An optional reranker must fail open without losing results

An intelligence layer can improve ordering but should not become a new single
point of failure for basic legal research. Evaluating a fixed shortlist also
creates a subtle truncation risk if unscored candidates are accidentally
replaced when the result set is rebuilt.

Action: preserve the complete CourtListener response, evaluate a bounded head,
append the untouched tail, and return the original order with a clear
unavailable state on authentication, timeout, rate-limit, or provider errors.

## 2026-09-20 — Vendor legal benchmarks are hypotheses, not acceptance proof

TypeSafe's CLERC reranking example demonstrates a relevant architectural
pattern, but its small vendor-authored query set, retrieval method, and question
are not the same as this product's users, CourtListener candidates, or error
costs.

Action: reproduce value on a frozen, attorney-reviewed CourtListener dataset;
measure ranking, recall, calibration, latency, cost, adversarial behavior, and
important jurisdiction/practice slices before recommending active use.

## 2026-09-20 — Readability is a system contract, not a font-size patch

Raising body text alone left metadata, tables, badges, the assistant, and
experimental intelligence panels at independently chosen miniature sizes. Root
scaling also exposed fixed-width header and narrow-card assumptions.

Action: maintain shared micro, supporting, and body tokens; bound long-form
reading width; offer a persistent user-controlled scale; and test the complete
layout at every supported scale instead of reviewing isolated components.

## 2026-09-20 — Internal overflow can become page overflow through grid sizing

A table already had horizontal scrolling, but its grid parent retained the
table's minimum content width. A Jev status label and a desktop-positioned usage
popover created similar whole-page overflow on phones.

Action: give grid panels and scroll wrappers `min-width: 0`, let headings wrap,
and assert document width—not only screenshots—at representative routes and
viewports. Include offending element details in the failed assertion.

## 2026-09-20 — Security headers must match the actual transport boundary

WebKit strictly followed `upgrade-insecure-requests` on the intentional HTTP
loopback fixture server and attempted to retrieve its own assets over TLS. The
page became blank even though Chromium and Firefox tolerated the same setup.

Action: retain insecure-request upgrading for native HTTPS and explicitly
trusted reverse-proxy deployments, but omit it for direct HTTP loopback review
servers. Run the focused responsive gate in all three browser engines so a
blank-engine failure cannot hide behind Chromium-only acceptance.

## 2026-09-20 — A width-only check can approve a broken application frame

The first responsive gate checked document width immediately after navigation.
It did not wait for route-specific asynchronous content, and it did not assert
that the shell itself remained the height of the browser. The pages therefore
passed even though a refreshed dashboard stretched the complete application to
more than 1,300 pixels on a 768-pixel-tall laptop.

Action: wait for a route-specific loaded heading, test the root, shell, header,
main pane, and scrollable research pane separately, and assert both axes. Use a
fixed viewport shell with one explicit content scroller; verify that a module
change resets that scroller to the top.

## 2026-09-20 — Responsive breakpoints must reflect usable content width

A 1024-pixel viewport looked like a laptop to the stylesheet, but the permanent
280-pixel navigation rail left only 744 pixels for the actual legal workspace.
Extra-large text made the result visibly cramped even though no element crossed
the document boundary.

Action: choose navigation breakpoints from the remaining research-pane width,
not device labels. Test each breakpoint with the largest supported text scale,
and keep icon-only compact states accessible without making them the default
when explanatory text still fits.

## 2026-09-20 — Off-canvas navigation is not hidden when it can still receive focus

Translating a drawer off screen removed it visually but left every link in the
keyboard order. It also allowed the research pane to move behind the open
drawer.

Action: pair the transform with visibility semantics, announce expanded state,
provide an in-drawer close control and Escape handling, and lock the background
scroller while the drawer is open. Test behavior, not only appearance.
