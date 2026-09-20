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
