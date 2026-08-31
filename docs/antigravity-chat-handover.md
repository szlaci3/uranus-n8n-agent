# Antigravity chat handover

**Handover date:** 2026-08-31  
**Validated repository checkpoint:** `93b223c` (`Continuous chat with Antigravity`)  
**Runtime used for live testing:** Docker-hosted n8n 2.26.4

## Current status

The Antigravity continuous-chat work is complete at its current proof-of-concept
scope. The authoritative artifact is the inactive export:

- `workflows/miranda-chat-antigravity.json`

It was re-imported into n8n after final memory hardening. The three-turn
conversation test and a separate-session pronoun-isolation test passed. The
chat-specific static validator also passes.

There is no pending workflow repair required before pausing this project.

## Deliberate artifact boundaries

Keep these files separate:

- `workflows/miranda-chat-antigravity.json` is the current continuous-chat
  Antigravity implementation.
- `workflows/miranda-one-call-antigravity.json` is the frozen stateless
  Antigravity comparison baseline. Do not retrofit chat or memory into it.
- `workflows/miranda-one-call-gemini.json` is the frozen Gemini comparison
  copy.
- `workflows/miranda-one-call-generalized.json` and its existing
  Gemini-oriented validator/documentation remain historical experiment
  artifacts.
- `workflows/n8n-memory-probe.json` is a disposable diagnostic artifact, not a
  production dependency.

The existing Gemini validator and Gemini-focused documentation were
intentionally left unchanged. The Antigravity chat has its own validator:

```powershell
node scripts/validate-chat-antigravity.mjs
```

Expected result:

```text
Antigravity chat workflow validation passed (48 nodes).
```

## Implemented architecture

```text
chatInput + sessionId
  -> load bounded visible session history
  -> Antigravity resolves the current turn to a standalone Cole question
  -> strict resolver-JSON validation and status routing
  -> deterministic index scoring or scoped literal fallback
  -> fresh canonical and linked-source reads
  -> bounded evidence packet
  -> Antigravity produces an evidence-only answer
  -> store the original visible user message and visible assistant response
```

The central grounding boundary is:

```text
history -> standalone question -> fresh retrieval -> evidence-only answer
```

Conversation history is used only to resolve references and preserve explicit
user constraints. It is not answer evidence, and it is not included in the
final Antigravity answer request.

## Memory behavior

- Simple Memory is keyed by the incoming Chat Trigger `sessionId`.
- The backend window is eight user/assistant exchanges.
- The contextualizer receives at most 16 prior visible messages, representing
  eight complete exchanges.
- Serialized history is additionally capped at 12,000 characters, with the
  oldest complete pairs removed first.
- The current user message is passed separately and is not duplicated in the
  history array.
- Exactly one visible user/assistant pair is inserted after a completed
  successful, clarification, help, or no-match turn.
- Transient technical errors are not stored.

The isolated probe established the installed n8n node shapes and confirmed
that Chat Trigger does not duplicate the explicit memory insertion. See
`docs/n8n-memory-probe.md` for the trace-level details.

## Confirmed live behavior

The final hardened export was re-imported and the following operator-run tests
passed:

1. A three-turn conversation:
   - `Why does chunking matter in RAG?`
   - `How about its costs?`
   - `Do they have to be used together?`
2. A new-session pronoun test, confirming that a session without the earlier
   subject asks for clarification instead of inheriting another session's
   context.

Earlier Antigravity evaluation also confirmed the deterministic direct
chunking route, the `dumb zone` literal fallback, and terminal `no_match` for
unsupported Kubernetes material.

## Request and quota behavior

| Turn outcome | Contextualizer calls | Answer calls | Total Antigravity calls |
|---|---:|---:|---:|
| Supported knowledge question | 1 | 1 | 2 |
| Terminal KB `no_match` | 1 | 0 | 1 |
| Clarification or help | 1 | 0 | 1 |
| Invalid chat envelope | 0 | 0 | 0 |

At an allowance of 100 Antigravity requests per day, the reliable two-call
design permits at most roughly 50 fully answered turns if every turn reaches
the answer model.

## Known limitations

- Simple Memory is in-process and single-instance. Persistence across n8n
  container restarts, workflow re-imports, queue mode, or multiple main
  processes must not be assumed.
- The n8n chat interface can display browser-held older conversation even when
  that history is no longer present in server-side Simple Memory. The resolver
  sees only history returned for the current server-side `sessionId`.
- The workflow export references the local HTTP Header Auth credential by
  name/ID but contains no API key. A different n8n instance must rebind that
  credential.
- Antigravity is called through the preview Interactions API contract used by
  the tested workflow. Provider behavior, preview availability, quotas, and
  agent identifiers may change.
- Evaluation is a small manually reviewed set, not an automated answer-quality
  benchmark or proof of broad semantic recall.
- The repository export remains inactive and should not be treated as a
  production deployment.

## Safe restart procedure

When work resumes:

1. Read this handover, `docs/antigravity-chat-plan.md`, and
   `docs/n8n-memory-probe.md`.
2. Confirm the worktree and run:

   ```powershell
   git status --short
   node scripts/validate-chat-antigravity.mjs
   ```

3. Import `workflows/miranda-chat-antigravity.json` into n8n 2.26.4 or verify
   node compatibility before using a newer n8n version.
4. Rebind the HTTP Header Auth credential if the imported nodes do not resolve
   it automatically.
5. Run the three-turn conversation and new-session pronoun test before making
   architecture changes.
6. Inspect `Build contextualizer request` when debugging memory. Its
   `conversation_history`, `history_message_count`, `current_user_message`, and
   `session_id` show exactly what the resolver received.

Do not diagnose memory from the chat widget alone; compare server-side session
IDs and the loaded history in the execution trace.

## Deferred work

These are optional future projects, not incomplete acceptance items:

- replace Simple Memory with Redis or Postgres for durable or multi-worker
  deployments;
- add a deterministic `/clear` command;
- evaluate safe contextualizer bypasses to reduce Antigravity calls;
- add non-English retrieval-question translation while preserving response
  language;
- automate the live conversational regression cases;
- add stronger deterministic answer/citation verification; and
- apply the proven chat layer to the Gemini one-call copy only as a separate
  experiment.

Do not use Antigravity `previous_interaction_id` or reuse a remote environment
as conversation memory. That would mix prior model state into the current turn
and weaken the fresh-evidence boundary.

