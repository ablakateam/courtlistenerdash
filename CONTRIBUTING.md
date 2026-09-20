# Contributing

CourtListenerDash is being developed privately before its first public release.
Contributions should preserve the application’s core trust rule: legal records
come from CourtListener, and AI-generated conclusions remain visibly linked to
the source material.

## Development workflow

1. Create a short branch from `main`.
2. Describe the legal-user problem before changing the interface.
3. Add or update tests for integration mappings and error states.
4. Run:

   ```bash
   npm ci
   npm run check
   npm test
   npm run build
   npm audit --omit=dev
   ```

5. Update `CHANGELOG.md`, the relevant audit record, and
   `docs/LESSONS_LEARNED.md` when the work changes behavior or reveals an
   integration constraint.
6. Open a pull request with test evidence and screenshots for visible changes.

## CourtListener integration rules

- Inspect the live MCP schema before adding a filter.
- Test with a known public record, not only a random query.
- Treat an empty result differently from an unavailable or invalid request.
- Never represent citation resolution as positive legal treatment.
- Never store or expose CourtListener tokens in browser code, screenshots,
  fixtures, logs, commits, or issue reports.
- Account-changing MCP tools require the existing explicit confirmation flow.

## Product review checklist

- Does the change save a lawyer time?
- Is the source authority easy to open and verify?
- Are loading, empty, partial, success, and error states distinguishable?
- Does it duplicate an existing workflow?
- Does it stay usable on a laptop and a narrow mobile viewport?
- Does it respect the connected account’s request limits?

## Security reports

Do not open a public issue for a suspected vulnerability or leaked credential.
Follow [SECURITY.md](SECURITY.md).
