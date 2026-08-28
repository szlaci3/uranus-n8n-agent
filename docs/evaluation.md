# Evaluation evidence

## Principle

**Retrieval/navigation correctness is evaluated from execution traces; plausible final prose alone is not proof of correct retrieval.**

For every question, evaluation proceeds in this order:

1. Define the expected canonical route from the KB’s indexes and links.
2. Inspect the actual ordered n8n tool calls and returned canonical paths.
3. Decide whether retrieval reached the required pages without irrelevant scans or unsupported shortcuts.
4. Only then judge whether every material answer claim and final citation is supported by pages successfully read during that turn.

A keyword candidate, snippet, Markdown link, video slug, or plausible model statement is not treated as retrieved evidence.

This is a manually reviewed proof-of-concept test set. It is not an automated benchmark, statistical quality claim, or proof of complete recall across the knowledge base.

## Acceptance layers

### 1. Supporting-tool containment

The initial live gate on n8n 2.26.4 exercised four valid reads and four invalid controls.

Valid reads:

- `index.md`
- `concepts/index.md`
- `concepts/chunking.md`
- a linked `sources/*.md` page

Closed controls:

- parent traversal: `../AGENTS.md`;
- an absolute path outside the KB;
- a non-Markdown file;
- a nonexistent allowed Markdown page.

All eight behaved as expected. The tested workflow returned structured provenance for successful reads and distinguishable errors without unrelated file content for rejected reads. The KB remained on a read-only bind mount.

The implementation also contains size, UTF-8, raw/maintenance-path, query-length, control-character, search-scope, and result-cap checks. Not every possible control in the broader private test contract was captured as a separate live execution, so those checks are not presented here as eight additional passed runtime cases.

### 2. Runtime navigation

A passing supported route must:

- begin at the root or an appropriate section index;
- reach every canonical concept/entity page needed by the question;
- treat fallback candidates only as locators;
- read linked source evidence when available;
- remain within the bounded agent loop;
- avoid raw transcripts and arbitrary filesystem access.

### 3. Grounded answer

A passing answer must:

- support every material KB claim from a page actually returned by `read_kb_page`;
- address every explicit clause of the question;
- list only exact canonical paths from successful reads that substantively support the answer;
- preserve available video-source provenance;
- explicitly decline when the pages read provide insufficient evidence.

## Recorded Gemini cases

| Case | Model | Expected route | Observed ordered route | Outcome |
|---|---|---|---|---|
| 1. Direct — “Why does chunking matter in RAG?” | Gemini 3 Flash Preview | index → `concepts/chunking.md` → linked source evidence | `index.md` → `concepts/chunking.md` → `sources/every-rag-strategy-explained-in-13-minutes-no-fluff.md` → `sources/the-future-of-rag-is-agentic-learn-this-strategy-now.md` | Passed after provenance correction; four reads and only successfully read citations |
| 2. Synthesis — “How are chunking and a knowledge base related?” | Gemini 3 Flash Preview | indexes → both canonical concepts → relevant sources | `index.md` → `concepts/chunking.md` → `concepts/knowledge-bases.md` → `sources/why-the-best-ai-coding-tools-abandoned-rag-and-what-they-use-instead.md` → `sources/your-ultimate-n8n-rag-ai-agent-template-just-got-a-massive-upgrade.md` | Passed; both concepts synthesized and cited from five reads |
| 3. Two-clause boundary — “When is RAG useful and what role does chunking play?” | Gemini 3 Flash Preview | indexes → `concepts/rag.md` + `concepts/chunking.md` → sources | `index.md` → `concepts/index.md` → `concepts/rag.md` → `concepts/chunking.md` → two linked source pages | Passed on retry after a provider 503; both clauses covered within six reads |
| 4. Literal fallback — “What does Cole mean when he says an LLM gets into ‘the dumb zone’?” | Gemini 3.5 Flash | index → no direct indexed phrase → literal candidate → full canonical page → source | `index.md` → `find_kb_pages("dumb zone")` → `concepts/context-rot.md` → `sources/are-agent-harnesses-bringing-back-vibe-coding.md` | Passed; one fallback call, candidate read before use, exact provenance |
| 5. Unsupported — “What does Cole recommend for Kubernetes cluster autoscaling?” | Gemini 3.5 Flash | index → one literal fallback → no evidence → refuse | `index.md` → `find_kb_pages("Kubernetes cluster autoscaling")` → terminal `no_match` | Passed after tool-contract correction; no second search and no Kubernetes answer from general model knowledge |
| 6. Regression — repeat direct chunking question | Gemini 3.5 Flash | preserve direct-case grounding after fallback changes | `index.md` → `concepts/chunking.md` → `concepts/rag.md` → two linked source pages | Passed; all listed citations were read. The extra RAG page was relevant but unnecessary and recorded as an efficiency observation |

Cases 1–3 are historical Stage 2A evidence from Gemini 3 Flash Preview. Cases 4–6 validate the accepted Stage 2B behavior and Gemini 3.5 Flash artifact published in this repository. They should not be rewritten as though every case used the same provider-model version.

## Failure-driven changes

### Phantom citations

An early Case 1 run successfully retrieved the index and relevant concept pages, but the final answer listed five source paths that appeared only as links inside those pages. None had been opened through `read_kb_page`.

Diagnosis: the model treated a linked path it had seen as equivalent to evidence it had retrieved.

Change:

- maintain a ledger containing only successful `kb_path` results;
- require a direct read of linked source evidence;
- audit the final Sources list against that ledger.

Result: the retry followed the four-read route shown above and removed every phantom citation.

### Repeated unsupported-query fallback

Early Case 5 runs declined the unsupported question correctly but searched twice: first for the literal phrase and then for a broadened `Kubernetes` query. This violated the one-search/no-rewrite policy.

Prompt clarification alone did not stop the repeated behavior reliably.

Change: when literal search finds no candidate, the supporting workflow now returns:

```json
{
  "status": "no_match",
  "terminal": true,
  "candidate_count": 0,
  "candidates": []
}
```

The result also gives an explicit insufficient-evidence next action.

Result: Gemini 3.5 Flash stopped after one literal search and did not supply an unsupported Kubernetes recommendation.

### Provider and efficiency observations

- One turn with N page reads used approximately N+1 Gemini requests because tool results return control to the model before the final answer.
- A six-request sequence hit a measured five-request-per-minute provider limit. Removing an unnecessary broad-page detour made the intended fallback route fit without reducing the iteration ceiling below valid routes.
- A `503 Service Unavailable` high-demand response interrupted one otherwise valid route. It was classified as provider capacity rather than a retrieval or grounding result and passed on delayed manual retry.

No automatic credential rotation or silent model substitution was introduced.

## Model-portability experiment

A disconnected experimental path used local `qwen3:8b` through n8n’s Ollama Chat Model with native thinking disabled. Connectivity, invocation, and basic tool calls worked, but the shared Gemini policy did not transfer reliably.

Observed Qwen behavior included:

- stopping before linked source reads;
- skipping the literal fallback;
- summarizing index pages instead of answering the question;
- omitting exact canonical Sources lists;
- adding claims absent from pages read;
- producing turns of 7,964 and 16,241 tokens in recorded cases.

Its lower call count resulted from skipped obligations rather than proven retrieval efficiency. Qwen therefore failed the accepted retrieval/provenance gate and is not present in the public workflow.

## What is and is not automated

[`scripts/validate-workflows.mjs`](../scripts/validate-workflows.mjs) automatically checks the exported JSON artifacts: topology, model, behavioral-field hashes, code syntax, inactive/unpinned state, and sanitation.

It does not:

- run n8n;
- call Gemini;
- judge retrieval relevance;
- score generated prose;
- replace the manual expected-route and execution-trace review described here.
