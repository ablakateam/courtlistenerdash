# Deployment acceptance — 2026-09-20

Status: **Accepted for continued private LAN evaluation**

Revision: Public-release candidate

Scope: Standalone CourtListenerDash application and its documented deployment
resources.

## Release gate

The exact Git revision was pushed only after these checks passed:

- TypeScript validation
- 17 backend, security, URL, MCP-client, and legal-analysis tests
- Production frontend build
- Dependency audit with no known production vulnerability
- Deterministic browser acceptance across the main attorney workflow
- Desktop and mobile serious/critical accessibility checks
- GitHub Actions application and container jobs

## Host acceptance

The supported installer completed and restarted only
`courtlistener-web.service`. The first private-network request landed during the
restart window and was refused, so it was not treated as acceptance evidence.
The listeners and route were then checked again.

| Check | Observed result | Status |
|---|---|---|
| CourtListenerDash service | Active and enabled | Passed |
| Application listener | `0.0.0.0:8788` | Passed |
| LAN HTTPS listener | nginx on `0.0.0.0:443` and `[::]:443` | Passed |
| Loopback health | Healthy, version 1.2.0 | Passed |
| Private-network health | `https://<LAN-HOST>/healthz` returned healthy | Passed |
| Private-network dashboard | HTTP 200 through nginx with security headers | Passed |
| Accepted frontend | Validation host served the accepted local build | Passed |

## What this acceptance means

The revision is available on the private LAN and is suitable for the next QA
cycle. It includes structured official-format citation verification, focused
collection searches, navigable citation and RECAP-document routes, explicit
secondary-action failure recovery, stale-response prevention, token/password
administration acceptance, seven CourtListener error categories, and the
action-level coverage ledger. It does not close the product-hardening milestone.
Remaining live checks are intentionally paced around CourtListener's account
allowance and include continued-result pagination, selected read-only tool edge
cases, complete oral playback, and disclosure source-document presentation.

The quota-free browser suite remains the primary regression gate, so ordinary
UI and workflow testing does not consume the connected CourtListener account.
