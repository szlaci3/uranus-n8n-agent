# n8n memory probe

This disposable workflow verifies the exact Chat Trigger, Chat Memory Manager,
and Simple Memory behavior installed in the local n8n 2.26.4 instance. It does
not call an LLM, read the knowledge base, or modify either Miranda workflow.

Artifact: `workflows/n8n-memory-probe.json`

## What it measures

For each incoming chat message, the probe:

1. loads messages already stored under the Chat Trigger `sessionId`;
2. returns their simplified and raw shapes in the execution output;
3. creates a deterministic echo response;
4. inserts the original user message and visible echo response into memory;
5. ends on an `output` string compatible with Chat Trigger; and
6. lets Chat Trigger reload the same stored history into the chat UI.

The workflow deliberately exposes diagnostic fields in its execution output.
They are for this probe only and must not be copied into the final Miranda chat
response.

## Expected two-turn result

Using one session ID:

- turn 1 loads zero prior interactions;
- turn 2 loads exactly one grouped interaction in the installed 2.26.4 shape:
  `{ "human": "...", "ai": "..." }`; and
- that grouped interaction normalizes to two visible messages: the turn-1
  user message and the turn-1 assistant response.

Using a second session ID must load zero prior interactions. If turn 2 loads
more than one grouped interaction, Chat Trigger is also inserting messages and
the main design must not duplicate that insertion.

The Simple Memory node uses `Connected Chat Trigger Node` session-ID mode.

## Safety

The checked-in workflow is inactive. It has no credential, provider call, KB
access, or workflow-tool connection. Its unauthenticated webhook mode exists
only so the probe can be exercised programmatically on localhost. Publish it
only for the duration of the test and unpublish it immediately afterward.

## Live result — 2026-08-31

The probe was imported into the local Docker-hosted n8n 2.26.4 instance,
published only for the test, exercised through localhost, and then
unpublished. n8n was restarted afterward and the probe endpoint returned 404.
The inactive workflow remains available in the editor under ID
`MemProbeUranus01`.

Observed behavior:

- first message in session C: `messages: []`, `messagesCount: 0`;
- second message in session C: one grouped object containing the first
  message pair, with `messagesCount: 1`;
- the normalized history was exactly `human: Alpha` followed by the prior AI
  echo response;
- first message in session D loaded zero interactions, confirming session
  isolation;
- explicit insert returned `{ "success": true }` and did not forward the
  prepared chat response, confirming that a final response-restoration node is
  required;
- no duplicate pair appeared, confirming that Chat Trigger did not insert the
  visible messages in addition to Chat Memory Manager.

The live export preserved Chat Trigger 1.4, Chat Memory Manager 1.1, Simple
Memory 1.4, all configured parameters, and all three `ai_memory` connections.

Simple Memory is an in-process, single-instance mechanism. The installed node
metadata explicitly warns that it is unsuitable for queue mode or multi-main
deployments. This probe did not establish durable history across container
restarts, so restart persistence must not be assumed. Redis or Postgres memory
is the later production option if that durability becomes a requirement.
