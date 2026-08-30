# Uranus: a grounded n8n knowledge agent

Uranus provides grounded answers over a linked knowledge base with inspectable provenance and explicit refusal when evidence is unavailable.

It is a tested n8n proof of concept for **agentic retrieval and grounded generation over a linked knowledge base**. A Gemini 3.5 Flash agent navigates canonical Markdown pages through two bounded, read-only workflow tools. Retrieval is judged from the execution trace; plausible final prose alone is not accepted as evidence that the right sources were retrieved.

> **Workflow image pending real n8n captures.** The final composite will show the accepted Gemini canvas, the supporting KB-navigation workflow, and the successful “dumb zone” fallback trace. See [the capture guide](assets/CAPTURE-GUIDE.md). No synthetic screenshot is used.

## What the system does

1. A user asks Miranda a question through n8n Chat Trigger.
2. Miranda begins at the knowledge base index and selects canonical pages from their displayed descriptions.
3. `read_kb_page` returns one validated Markdown page with its canonical `kb_path`, repository-relative `source_path`, and content.
4. If the indexes expose no plausible entry, Miranda may call `find_kb_pages` once with a literal phrase from the question, then read a selected candidate before using it as evidence.
5. Miranda answers from pages successfully read during that turn and lists their exact paths, or states that the KB does not provide enough evidence.

## Architecture

```text
n8n Chat Trigger
       |
       v
Miranda — n8n AI Agent
       |-- Gemini 3.5 Flash
       |-- read_kb_page  -- exact, allowlisted Markdown retrieval
       `-- find_kb_pages -- one-shot, literal keyword fallback
                              |
                              `-- candidate must be read before use
```

The accepted system contains two n8n workflows:

- [`miranda-chat-gemini.json`](workflows/miranda-chat-gemini.json) contains Chat Trigger, Miranda, Gemini 3.5 Flash, and the two agent-facing tools.
- [`kb-navigation.json`](workflows/kb-navigation.json) implements exact-page reads, scoped literal search, input and path validation, size and UTF-8 checks, structured results, and closed error branches.

Technically, this is **non-vector RAG**: external knowledge is retrieved before generation, but no embedding model or vector store participates. The source KB already supplies curated indexes, canonical pages, and typed Markdown links. For this proof of concept, using that native structure preserved page-level provenance and avoided adding an ingestion, ranking, and synchronization system without an observed retrieval need.

## Reliability and grounding design

### Deterministic workflow/tool controls

- A fixed read-only KB root and conservative path allowlist.
- Rejection of absolute paths, traversal, non-Markdown files, raw transcripts, maintenance paths, missing pages, oversized pages, and invalid UTF-8.
- A 128 KiB per-page limit measured above the valid KB baseline.
- Literal search restricted to `concepts/`, `entities/`, and `sources/`, with a 120-character query limit and at most five candidates.
- Structured success and error results containing canonical provenance rather than arbitrary filesystem access.
- A zero-result fallback response with `status: no_match` and `terminal: true`.
- Inactive, unpinned public workflow exports with no credentials or provider secrets.

### Tested model-followed behavior

- Begin knowledge questions at `index.md` and follow only relevant canonical links.
- Maintain a within-turn ledger of successful `read_kb_page` results.
- Treat links, keyword candidates, and snippets as locators rather than evidence.
- Read linked `sources/*.md` evidence for supported substantive answers when available.
- Cover every explicit clause of a multi-part question.
- Audit final citations against successfully read paths.
- Decline unsupported questions rather than filling gaps from model knowledge.

These latter controls are prompt instructions whose behavior was manually tested; they are not a deterministic final-answer verifier. n8n bounds the agent at eight iterations, while the prompt separately instructs it to use no more than eight KB tool calls.

## Evaluation evidence

The evaluation separates navigation from answer quality. A generated answer is judged only after its ordered n8n tool trace reaches appropriate canonical pages with usable provenance.

| Case | Observed retrieval route | Result |
|---|---|---|
| Direct: why chunking matters in RAG | `index.md` → `concepts/chunking.md` → two linked source pages | Passed |
| Synthesis: chunking and knowledge bases | `index.md` → both canonical concept pages → two linked source pages | Passed |
| Two-clause boundary: RAG usefulness and chunking | indexes → `concepts/rag.md` + `concepts/chunking.md` → two sources | Passed |
| Literal fallback: “dumb zone” | `index.md` → one `find_kb_pages` call → `concepts/context-rot.md` → linked source | Passed |
| Unsupported Kubernetes question | `index.md` → one literal search → terminal `no_match` → explicit refusal | Passed |
| Gemini 3.5 Flash regression | direct chunking case repeated after fallback changes | Passed |

The cases and exact routes are documented in [Evaluation](docs/evaluation.md). This is a small, manually reviewed test set—not an automated benchmark or proof of complete KB recall. The repository’s automated check validates the workflow artifacts only.

## Failure-driven engineering

### Plausible answer, phantom citations

In the first successful direct retrieval run, Miranda listed five source paths that appeared as links inside pages but had never been opened through the tool. The answer looked credible, but its execution trace did not support those citations. The grounding contract was changed to require a successful-read ledger, a direct linked source-page read, and a final citation audit. The retry followed a four-read route and cited only pages actually returned by `read_kb_page`.

### Prompt-only fallback limit was insufficient

For an unsupported Kubernetes question, Gemini correctly refused to invent an answer but repeatedly broadened the literal query and called the fallback twice, despite an explicit one-search prompt rule. Prompt clarification did not fix the behavior reliably. The tool protocol was therefore changed: zero candidates now return `status: no_match`, `terminal: true`, and an explicit insufficient-evidence next action. Gemini 3.5 Flash then stopped after one search and declined the question without an unsupported claim.

A separate rate-limit incident also showed that a user turn with several tool calls creates several provider requests. An unnecessary retrieval detour was removed through prompt economy rather than by reducing the iteration ceiling below the routes required by the evaluation cases.

## Model-portability experiment

A local Qwen3 8B model connected through n8n’s Ollama node and could invoke tools, but it did not pass the same behavioral contract. It skipped linked-source and fallback obligations, summarized index pages, omitted canonical citations, and expanded beyond retrieved evidence. Its lower call count represented incomplete work rather than demonstrated efficiency. Gemini 3.5 Flash remains the accepted baseline; the Qwen workflow is intentionally not included here.

## Planned one-call measurement

The [one-call evidence-packet pilot](docs/one-call-pilot.md) specifies an
isolated, one-question comparison between accepted Miranda and a deterministic
bounded evidence packet followed by one Gemini answer call. The inactive
artifact is `workflows/miranda-one-call-pilot.json`. Its single live Q4 run
passed answer quality, grounding, and provenance with one Gemini action,
2,246 total tokens, and a 30.539-second duration, versus five actions and
26,957 tokens for the accepted control. This question-specific result does not
establish a general retrieval replacement. The accepted workflow artifacts
are unchanged.

The follow-up [generalized one-call experiment](docs/generalized-one-call.md)
is prepared as `workflows/miranda-one-call-generalized.json`. It scores the
KB's existing canonical indexes deterministically, uses one scoped literal
fallback only when needed, reads linked source evidence, and builds one
bounded packet before Gemini. Static and local five-case validation pass; no
live generalized answer result is claimed yet.

## Run locally

The tested target was Docker-hosted n8n 2.26.4. The public exports intentionally contain no Gemini credential and no instance-specific binding between the chat tools and supporting workflow.

At a high level:

1. Obtain the external Cole Medin knowledge-base dependency at the tested revision.
2. Mount this repository read-only at `/home/node/.n8n-files/Uranus` in the n8n container.
3. Import `kb-navigation.json`, then `miranda-chat-gemini.json`.
4. Select the imported `kb-navigation` workflow in both tool nodes.
5. Select a local n8n Gemini credential and confirm `models/gemini-3.5-flash`.
6. Activate only the supporting workflow while Miranda calls it, then run the documented controls.

See [Local setup](docs/setup.md) for the complete procedure. Never place API keys, the n8n encryption key, runtime database, or execution history in this repository.

## Limitations

- This is a tested proof of concept, not a production deployment, n8n core feature, text-to-workflow system, or B2B SaaS product.
- Behavioral evaluation is manual and covers a small scenario set.
- There are no embeddings, vector store, semantic reranking, or chunk-level retrieval.
- The external KB is required but not distributed here.
- Literal fallback scans 689 approved Markdown pages at the tested KB snapshot; it is appropriate for this local corpus, not a demonstrated scalable search service.
- The read ledger and citation audit are model-followed instructions, not deterministic output post-processing.
- There is no conversational memory, automatic provider retry, failover, or credential rotation.
- The system has not been load-tested or designed for multi-tenant operation.
- Imports require local credential selection and supporting-workflow rebinding.
- Qwen3 8B did not satisfy the accepted Gemini retrieval and provenance contract.
- The generalized one-call workflow has not completed its live multi-question
  gate and remains experimental.

## Ownership and AI assistance

I designed the architecture and evaluation criteria, operated and tested the system, and used AI coding agents extensively to implement and iterate it.

The runtime model dynamically chose retrieval steps and generated answers within the configured tool and prompt policy. I judged those choices from n8n execution traces and rejected outputs when their evidence was insufficient—including the plausible answer whose listed citations had not actually been retrieved.

## Third-party knowledge base

The Cole Medin knowledge base is an external dependency and is not bundled or relicensed by this project. Its tested source revision and separation from this repository are documented in [Third-party material](THIRD_PARTY.md).

## Artifact validation

Run:

```bash
node scripts/validate-workflows.mjs
```

This checks JSON structure, accepted topology, behavioral-field hashes, model selection, inactive/unpinned state, and sanitation. It does not call an LLM or evaluate generated answers.
