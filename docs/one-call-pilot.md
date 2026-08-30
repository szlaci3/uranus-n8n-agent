# One-call evidence-packet pilot

**Status:** One-question pilot passed on 2026-08-30. The accepted Miranda
baseline remains unchanged; generalization is not yet evaluated.

## Decision

Run one isolated experiment that compares the accepted, multi-call Miranda
route with a deterministic evidence packet followed by one Gemini answer
call. Keep `workflows/miranda-chat-gemini.json` and
`workflows/kb-navigation.json` unchanged as the accepted baseline and control.

The pilot does not add a lexical index, embeddings, vector retrieval,
chunking, query expansion, or model-driven retrieval. For one exact question,
the route can be selected from the Cole KB's existing indexes and typed links,
using the existing scoped literal fallback only if the indexes do not expose a
plausible entry. Once reviewed, that route is frozen in the pilot artifact.
Runtime selection is then an exact question-to-route match, not a general
semantic retriever.

This is a deliberately narrow experimental exception to Uranus's accepted
agent loop. It tests whether removing repeated model/tool turns reduces model
overhead while preserving answer evidence. It does not replace Miranda or
establish a reusable batching contract.

## Q4 control evidence

The user supplied the following record from the actual n8n Q4 execution on
2026-08-30:

- Exact question: `What does Cole mean when he says an LLM gets into “the
  dumb zone”?`
- Ordered trace: `read_kb_page(index.md)` →
  `find_kb_pages("dumb zone")` →
  `read_kb_page(concepts/context-rot.md)` →
  `read_kb_page(sources/are-agent-harnesses-bringing-back-vibe-coding.md)`.
- Literal fallback: one successful `keyword_literal` search for `dumb zone`;
  it returned only `concepts/context-rot.md`, was not truncated, and the
  candidate was subsequently read as required.
- Gemini actions: five, including the final answer action.
- Total token usage: exactly 26,957. n8n did not expose an input/output/cache
  breakdown. The user reported approximate per-action totals of 1,400, 4,000,
  4,700, 6,700, and 9,600 tokens; these sum to 26,400 and therefore remain
  approximations rather than a substitute for the exact total.
- Final citations: `concepts/context-rot.md` and
  `sources/are-agent-harnesses-bringing-back-vibe-coding.md`.

The recorded control answer was:

> According to Cole, when a Large Language Model (LLM) gets into the **“dumb
> zone,”** it refers to a state of severe output degradation caused by
> **context rot** and the theoretical limit of **bounded attention**.
>
> It describes what happens when too much information, instructions, or stale
> data are loaded into an LLM's context window over a long session,
> overwhelming the model and causing its performance to slide.
>
> ### Key Aspects of “The Dumb Zone”
>
> 1. **Bounded Attention & Information Overload** — The core idea behind the
>    “dumb zone” is that LLMs, like humans, get overwhelmed when flooded with
>    too much information. As the context window grows, the model struggles
>    with “bounded attention”—making it increasingly difficult to pull out and
>    focus on the exact information or instructions needed for the current
>    turn (a classic “needle in a haystack” problem).
> 2. **Soft Decline vs. Hard Limits** — The “dumb zone” is not a hard stop at
>    the maximum token limit. Rather, it is a gradual, soft slide in quality.
>    Cole warns that just because modern models (like Claude Code) can
>    physically support large context windows (e.g., up to 1 million tokens),
>    it does not mean they can handle them gracefully.
> 3. **Uptick in Hallucinations** — Entering the “dumb zone” leads to a drastic
>    rise in hallucinations and a general failure to follow prompt
>    instructions. Cole notes that once a session reaches about **250,000 to
>    300,000 tokens**, developers will typically see a massive uptick in these
>    failures.
> 4. **The Need for Context Management** — To keep agents out of the “dumb
>    zone,” Cole emphasizes the importance of context engineering. This
>    includes avoiding tool bloat (which consumes extra tokens), offloading
>    tasks to isolated subagents, performing context resets (such as using
>    memory compaction or writing handoff prompts to start clean sessions), and
>    building agent harnesses that clear context regularly between loops.
>
> ### Sources
>
> - `concepts/context-rot.md`
> - `sources/are-agent-harnesses-bringing-back-vibe-coding.md`

This actual record supersedes the handover's informal report of seven files and
approximately 53K tokens for Q4. The formal control is four tool calls, five
Gemini actions, and exactly 26,957 total tokens.

After reviewing the trace against the KB's `index.md`, section indexes, and
typed links, freeze the smallest route that still covers every explicit clause
of Q4 and preserves linked source evidence. A baseline detour may be omitted
only when the decision is recorded; omitting it must not remove evidence
needed to judge a material claim.

## Prepared workflow

The third, inactive workflow is
`workflows/miranda-one-call-pilot.json`. Its visible n8n path is:

```text
Manual test input
  -> Validate exact Q4 question
  -> Emit frozen canonical route
  -> Read and validate each approved Markdown page
  -> Extract bounded canonical evidence
  -> Assemble and validate one evidence packet
  -> Gemini 3.5 Flash
  -> Return answer plus measurement fields
```

The pilot uses a manual trigger because it is a measurement artifact, not a
second user-facing chat system. The accepted `kb-navigation` workflow remains
the containment reference: the pilot must use the same fixed Uranus-owned KB
root, Markdown allowlist, UTF-8 requirement, 128 KiB per-page ceiling, and
structured closed errors. It must never read `raw/`, maintenance material, or
another repository and must expose no shell, SQL, filesystem path, or write
input.

The route manifest contains only the frozen exact Q4 question and reviewed
canonical page paths. A different question returns a structured
`PILOT_QUESTION_MISMATCH` result before filesystem access or a model call.
There is no runtime query rewriting or fallback broadening.

## Evidence-packet contract

The packet is a JSON object with this minimum shape:

```json
{
  "schema": "uranus-evidence-packet-1",
  "question": "<exact frozen Q4 question>",
  "selection_method": "frozen_index_and_link_route",
  "route": ["<canonical path in read order>"],
  "evidence": [
    {
      "kb_path": "concepts/example.md",
      "source_path": "knowledge/cole-medin-knowledge-base/concepts/example.md",
      "heading": "<canonical heading>",
      "excerpt": "<verbatim bounded excerpt>",
      "linked_sources": ["sources/example.md"]
    }
  ],
  "limits": {
    "max_pages": 2,
    "max_excerpt_chars_per_page": 5000,
    "max_packet_chars": 10000
  }
}
```

Every evidence item is reloaded from canonical Markdown during the execution;
the workflow does not embed KB prose in its JSON export. Excerpts are
verbatim, retain their canonical heading, and carry exact canonical and
repository-relative paths. Source records needed for a positive answer are
separate evidence items, not merely link strings copied from a concept page.

The frozen limits are two evidence pages, 5,000 characters per excerpt, and
10,000 characters for the serialized packet. Exceeding a bound returns a
structured error before Gemini runs; content is never silently truncated. The
packet validator rejects duplicate paths, route/evidence mismatches, missing
source evidence, invalid UTF-8, unresolved provenance, and an empty packet.

Static assembly against the authoritative Uranus KB produced a 6,961-character
packet: a 2,353-character concept excerpt and a 2,742-character source
excerpt, plus the packet schema and provenance metadata. This is a local
deterministic measurement, not a Gemini token count or live answer result.

Gemini receives only the exact question, the validated packet, and a short
grounding instruction. The instruction requires it to answer every explicit
question clause, use only packet evidence, cite only `kb_path` values present
in the packet, preserve available linked source provenance, and state that the
packet is insufficient rather than use model knowledge. A normal successful
execution contains exactly one Gemini model action.

## Comparison with the accepted control

Run the accepted Miranda control and the pilot on the same exact Q4 question
with `models/gemini-3.5-flash`. Keep credential selection, provider tier, and
generation settings the same where n8n exposes them. Do not rotate credentials
to mask a provider error. Record provider `429` and `503` failures separately
from retrieval or answer failures.

Use one result row per run:

| Field | Accepted Miranda control | One-call pilot |
|---|---|---|
| Exact question | Required | Must match control byte-for-byte |
| Retrieval/selection trace | Ordered agent tool calls | Frozen route plus packet entries |
| Answer quality | Pass/fail with note | Pass/fail with note |
| Clause completeness | Pass/fail per explicit clause | Pass/fail per explicit clause |
| Grounding | Claims supported by pages actually read | Claims supported by packet excerpts |
| Provenance | Citations in successful-read ledger | Citations in packet `kb_path` set |
| Model-call count | Count every Gemini action | Must be exactly one on success |
| Token usage | Exact exposed usage fields | Same fields and measurement source |
| Provider/runtime failure | Record code and action | Record code and action |

The pilot passes only if answer quality, completeness, grounding, and
provenance all pass and the successful trace contains exactly one Gemini call.
Token usage is reported as an observation, not a promised reduction. A smaller
token count does not compensate for missing clauses, weak evidence, phantom
citations, or an unsupported claim.

## Scope boundary and next decision

Static validation can prove the workflow is inactive, unpinned, credential-
free, instance-neutral, bounded, and separate from the accepted artifacts. It
cannot prove answer quality or call count.

After the single live comparison, decide one of three outcomes:

1. Reject the experiment if evidence quality or provenance regresses.
2. Retain it as a question-specific measurement if it works but does not
   generalize without a new retrieval architecture.
3. Propose a separate architecture revision only if the measured result
   justifies generalizing deterministic packet assembly.

No outcome from this one-question pilot changes the accepted Gemini Miranda
baseline automatically.

## Live pilot result

The user ran the inactive pilot manually on 2026-08-30 with
`models/gemini-3.5-flash` and the same credential and provider tier as the
accepted control. The n8n trace showed exactly one Gemini action, no retry,
and a successful final answer. Provider usage was exactly 2,246 total tokens;
n8n exposed no input/output/cache breakdown. Execution duration was 30.539
seconds.

The answer directly explained the “dumb zone” as bounded attention/context
rot, covered gradual quality decline, difficulty locating relevant context,
the needle-in-a-haystack problem, and increased hallucinations around the
recorded 250,000–300,000-token warning range. Every material claim was present
in the packet. Its Sources section contained exactly:

- `concepts/context-rot.md`
- `sources/are-agent-harnesses-bringing-back-vibe-coding.md`

The live comparison is:

| Field | Accepted Miranda control | One-call pilot |
|---|---:|---:|
| Gemini actions | 5 | 1 |
| Total tokens | 26,957 | 2,246 |
| Token difference | — | 24,711 fewer |
| Relative token change | — | 91.7% lower |
| Approximate size ratio | — | 12× smaller |
| Duration | Not recorded | 30.539 seconds |
| Answer quality | Pass | Pass |
| Clause completeness | Pass | Pass |
| Grounding | Pass | Pass |
| Provenance | Pass | Pass |

This closes the one-question experiment as a pass: it removed four repeated
model-loop actions and substantially reduced token usage without degrading the
scored answer. The result is retained as question-specific evidence. It does
not demonstrate that a frozen route can replace general index-and-link
retrieval for arbitrary questions, and it does not alter the accepted Miranda
workflow automatically.
