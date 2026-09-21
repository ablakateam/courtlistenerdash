# Product roadmap

## Milestone 1 — Repository and portable deployment

Status: **Complete**

- Public GitHub repository with a clean release baseline and protected secret
  boundary
- Reproducible Node and Docker builds
- Docker Compose with local HTTPS
- Hardened Ubuntu/systemd deployment retained
- Continuous integration and dependency updates
- Initial security and deployment documentation

Exit evidence: GitHub CI passed Node verification and the production container
build for the public-release snapshot.

## Milestone 2 — Product hardening and complete integration audit

Status: **In progress**

- [x] Establish a repeatable live MCP audit with known public records
- [x] Confirm the complete official MCP tool inventory
- [x] Identify and correct unsupported disclosure/document ordering filters
- [x] Separate Global, Legal Research, and Semantic Search purposes
- [x] Add quota-conscious PACER/RECAP progressive loading
- [x] Add secure oral-argument audio and transcript workspace
- [x] Make disclosure discovery work by judge name
- [x] Add ordinary-workflow search pagination
- [x] Make judge and disclosure detail tabs load progressively
- [x] Add friendly CourtListener error categories and bounded read-only retries
- [x] Add a repeatable live browser harness and initial verified screenshots
- [x] Add exact-citation search and browser-verify a predictable authority
- [x] Add automated WCAG checks and fix the first contrast findings
- [x] Establish a readable legal-text scale, persistent enlargement control,
      bounded opinion measure, and desktop/laptop/tablet/phone overflow gate
- [x] Run the focused responsive/readability matrix in Chromium, Firefox, and
      WebKit and keep it in continuous integration
- [x] Distinguish minute, hour, and day throttles without long hourly waits
- [x] Add local retry controls to primary legal-record workspaces
- [x] Add a quota-free browser acceptance suite to continuous integration
- [x] Pass desktop and mobile serious/critical WCAG checks on representative
      primary workspaces
- [x] Deploy the CI-accepted hardening revision and verify loopback and
      private-network HTTPS health
- [x] Present official MCP citation-analysis reports as navigable, structured
      verification results rather than raw text
- [x] Exercise every top-level route and the principal attorney workflows in
      the quota-free browser suite
- [x] Accept credential rotation/removal, password rotation, failure recovery,
      and stale-result cleanup through the quota-free browser suite
- [x] Publish an action-level coverage ledger for every visible module
- [ ] Complete browser-level testing of every route and action
- [ ] Verify opinion, citation, document, docket, judge, disclosure, and oral
      workflows after deployment
- [ ] Live-test continued-result pagination after the account window resets
- [ ] Exercise every read-only MCP tool with valid and invalid inputs
- [ ] Validate state-changing tools through confirmation without creating
      unwanted account state
- [ ] Complete native assistive-technology, performance, and remaining failure-
      state review
- [x] Publish the first verified screenshots and educational README
- [x] Add QA-accepted oral-argument, judge, disclosure, and citation-
      verification screenshots without consuming live account quota
- [x] Document CourtListener and Free Law Project attribution and connect the
      project with the LawNova and Prose open-product mission
- [x] Add backend-only paid Ollama Cloud discovery, selectable live model
      catalog, secure endpoint-bound key handling, and provider smoke test
- [x] Add a persistent page-aware legal research assistant with exact source
      passages, multi-turn questions, route-specific guidance, protected
      workspaces, live Ollama acceptance, and responsive accessibility coverage
- [x] Add an ephemeral live-page retrieval index for rendered text, visible
      controls, trusted platform navigation, and question-focused context
      selection without autonomous UI actions or persisted browsing history
- [x] Add an independent TypeSafe Jev decision service, encrypted settings,
      pinned-model protection, shadow/active modes, semantic relevance lens,
      Decision Lab, provenance store, cost/latency telemetry, and fail-open
      CourtListener behavior
- [x] Add a versioned offline evaluation harness for relevance, ranking,
      calibration, latency, and cost
- [ ] Build and adjudicate the first attorney-reviewed CourtListener relevance
      dataset before recommending active Jev reranking

Exit criteria: all high-severity findings closed, every visible feature has a
verified backend path and appropriate state handling, and the practicing-lawyer
workflow in the audit record passes end to end.

## Milestone 3 — Production readiness

Status: **In progress**

- Clean public repository snapshot, CI baseline, dependency automation, and
  security scanning
- Backup/restore drill for encrypted credentials and research data
- Structured application logs and operational health dashboard
- Release version, signed tag, release notes, and rollback rehearsal
- Public deployment guide validation on at least two independent platforms
- Open-source license selection and licensed release review

## Milestone 4 — Advanced attorney workflows

Status: **Planned**

- Side-by-side case comparison
- Research folders and matter-oriented collections
- Exportable source-linked research memoranda
- Citation-network filtering and larger graph navigation
- Additional long-document analysis evaluations and model-quality benchmarks
- Evaluated Jev Opinion Navigator for holding, facts, rule, standard, analysis,
  disposition, concurrence, and dissent passages
- Evaluated summary-claim support checker and assistant-context gate
- Hybrid similar-case ranking using semantic retrieval plus versioned legal
  signals, after controlled ablation testing
