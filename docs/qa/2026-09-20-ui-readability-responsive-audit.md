# UI readability and responsive-platform audit

Date: **2026-09-20**  
Version: **1.4.0**  
Status: **Accepted for the current public-preview baseline**

## Purpose

This cycle treated the interface as a professional reading environment rather
than a compact administration screen. The primary user is an attorney who may
spend hours reading dense opinions, metadata, docket entries, citations, and
AI-source references. The backend contracts were frozen during the redesign:
CourtListener, MCP, TypeSafe, legal-AI, authentication, and persistence behavior
were not refactored.

## Readability contract

- Normal legal content starts at a conventional 16-pixel-equivalent baseline.
- Supporting labels and metadata have explicit minimum scales instead of
  scattered 8–11 pixel text.
- Opinion and transcript prose uses a larger serif face, generous leading, and
  a roughly 78-character reading measure.
- Primary controls are at least 44 pixels high; navigation targets are 46
  pixels high; compact page-map controls remain at least 36 pixels high.
- Keyboard focus has a visible, high-contrast outline across interactive
  elements.
- Reduced-motion preferences suppress nonessential movement.
- Standard, Large, and Extra large text sizes are available in the persistent
  header control. The selection is stored only in browser local storage and
  survives navigation and reload.

## Responsive organization

- Desktop navigation is wider so full legal-workflow labels remain legible.
- At narrower laptop widths, secondary header labels collapse while every
  function remains available through an accessible name.
- On phones, the header becomes two rows: menu, usage, text size, and connection
  status remain on the first row; global search receives the full second row.
- Tables, citation graphs, opinion tabs, and selectors scroll inside their own
  bounded regions instead of widening the complete page.
- The page-aware assistant expands to a 500-pixel desktop reading panel and a
  full inset phone panel, with larger messages, sources, prompts, and composer.
- Jev cards and panel headings wrap cleanly at narrow widths.

## Defects found and corrected

1. The mobile usage popover retained a desktop offset and widened the document.
2. A Jev schema-status badge could force a narrow panel beyond the viewport.
3. The mobile connection control hid both its text and its status dot, leaving
   an unexplained empty square.
4. Direct loopback HTTP in WebKit obeyed Helmet's default
   `upgrade-insecure-requests` directive and attempted to fetch local assets
   over unavailable TLS. Direct-HTTP review and fixture servers now omit that
   directive; native HTTPS and trusted-proxy deployments retain it.
5. Fixture password rotation was restored at the end of its test so one browser
   engine cannot contaminate the next engine's acceptance run.

## Automated acceptance

The deterministic suite uses CourtListener-shaped fixture data and spends no
CourtListener, TypeSafe, or legal-AI quota.

| Gate | Result |
|---|---|
| Chromium legal workflow regression | Six complete workflows passed |
| Cross-engine responsive/readability workflow | Passed in Chromium, Firefox, and WebKit |
| Viewport matrix | 1440×900, 1024×768, 768×1024, and 390×844 passed |
| Page-level horizontal overflow | Absent on Dashboard, case, RECAP docket, Jev Decision Lab, and Settings at every tested size |
| Text-size persistence | Extra large resolves to 20px root size and survives reload |
| Minimum sampled case text | Metadata ≥13px, supporting text ≥14px, opinion text ≥17px at Standard |
| Automated accessibility | No serious or critical WCAG A/AA findings on the enlarged phone case workspace |
| TypeScript and production build | Passed |

The full browser command runs **nine accepted tests**: seven Chromium tests
(six end-to-end product workflows plus the responsive audit) and one focused
responsive/readability audit in each of Firefox and WebKit.

## Manual visual review

The refreshed desktop dashboard, case workspace, search results, RECAP docket,
oral argument, judge, disclosure, citation, Jev, and assistant screenshots were
reviewed after the automated run. A dedicated Extra-large phone case-workspace
screenshot records the most demanding reading configuration.

## Remaining boundaries

- Automated engine coverage is not a substitute for native assistive-
  technology testing. VoiceOver on physical Apple hardware, NVDA/JAWS on
  Windows, TalkBack on Android, and keyboard-only review remain valuable
  release checks.
- Browser text enlargement and responsive dimensions are accepted, but a
  complete action-by-action audit of every secondary control remains tracked in
  the action ledger.
- Browser or OS font substitution can change line breaks. Layouts therefore
  wrap or scroll locally instead of depending on one exact font metric.

## Regression rule

New visible features must use the shared text scale, retain a usable
Extra-large layout, and join the responsive test matrix when they introduce a
new workspace pattern. A backend change is not an acceptable shortcut for a
presentation-only defect.
