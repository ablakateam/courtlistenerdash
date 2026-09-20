# Jev legal-relevance evaluation

Active reranking is gated by an attorney-reviewed dataset. Each JSONL row represents one CourtListener candidate for one research question:

```json
{"queryId":"q-001","candidateId":"cl-123","label":3,"score":0.94,"baselineRank":4,"jevRank":1,"latencyMs":180,"estimatedCostUsd":0.00002}
```

`label` uses a fixed rubric:

- `0` — irrelevant or word overlap only;
- `1` — topically related, but not useful to answer the question;
- `2` — materially relevant;
- `3` — directly responsive authority or passage.

At least two attorneys should independently label a representative, pooled candidate set before resolving disagreements. Keep judge identities and adjudication notes outside the public dataset if needed, but publish the rubric, dataset version, collection method, and aggregate agreement. The evaluator reports nDCG@10, MRR@10, precision@5, recall@10, Brier score, expected calibration error, latency, and cost.

Run:

```bash
npm run eval:jev -- eval/datasets/your-reviewed-dataset.jsonl
```

The harness measures an existing run; it does not call TypeSafe or invent labels. This separation prevents an API outage, prompt change, or model change from altering the benchmark while it is being scored.

`fixtures/synthetic-relevance.jsonl` exists only to regression-test the metric
calculations. It is not a legal benchmark and must never be reported as model
quality evidence.
