import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = resolve(repositoryRoot, 'workflows/miranda-chat-antigravity.json');
const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));

const fail = (message) => {
  throw new Error(message);
};
const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : fail('nodes must be an array.');
const byName = new Map();
for (const node of nodes) {
  if (!node?.name || byName.has(node.name)) fail(`Duplicate or missing node name: ${node?.name ?? '<missing>'}`);
  byName.set(node.name, node);
}
const node = (name) => byName.get(name) ?? fail(`Missing node: ${name}`);

for (const [sourceName, channels] of Object.entries(workflow.connections ?? {})) {
  if (!byName.has(sourceName)) fail(`Connection source does not exist: ${sourceName}`);
  for (const channel of Object.values(channels ?? {})) {
    for (const branch of channel ?? []) {
      for (const connection of branch ?? []) {
        if (!byName.has(connection.node)) fail(`Connection target does not exist: ${connection.node}`);
      }
    }
  }
}

if (workflow.name !== 'miranda-chat-antigravity') fail('Workflow name is not miranda-chat-antigravity.');
if (workflow.active !== false) fail('Chat workflow must remain inactive in the repository export.');
if (workflow.webhookId) fail('Workflow-level webhookId must not be published.');
if (workflow.nodes.some((candidate) => candidate.webhookId)) fail('Chat Trigger webhookId must not be published.');
if (JSON.stringify(workflow).includes('previous_interaction_id')) fail('Remote interaction state must not be reused.');
for (const forbidden of ['Manual test — set question', 'Why does chunking matter in RAG?', 'dumb zone', 'Kubernetes']) {
  if (JSON.stringify(workflow).toLowerCase().includes(forbidden.toLowerCase())) fail(`Hard-coded evaluation data found: ${forbidden}`);
}

// n8n exports may omit default-valued parameters. Only undefined uses the
// default; explicit nulls and incorrect values must still fail validation.
const withDefault = (value, defaultValue) => value === undefined ? defaultValue : value;

const trigger = node('When chat message received');
if (trigger.type !== '@n8n/n8n-nodes-langchain.chatTrigger') fail('Unexpected Chat Trigger type.');
if (withDefault(trigger.parameters?.public, false) !== false || withDefault(trigger.parameters?.mode, 'hostedChat') !== 'hostedChat') fail('Chat Trigger must be private hosted chat.');
if (withDefault(trigger.parameters?.options?.responseMode, trigger.parameters?.availableInChat === true ? 'streaming' : 'lastNode') !== 'lastNode') fail('Chat Trigger must respond from the last node.');

const memory = node('Conversation Simple Memory');
if (memory.type !== '@n8n/n8n-nodes-langchain.memoryBufferWindow') fail('Unexpected memory backend type.');
if (withDefault(memory.parameters?.sessionIdType, 'fromInput') !== 'fromInput') fail('Memory must use the incoming sessionId.');
if (!String(withDefault(memory.parameters?.sessionKey, '={{ $json.sessionId }}')).includes('sessionId')) fail('Memory session key must use sessionId.');
if (memory.parameters?.contextWindowLength !== 8) fail('Memory backend window must be eight exchanges.');

const load = node('Load prior session messages');
if (withDefault(load.parameters?.mode, 'load') !== 'load' || withDefault(load.parameters?.simplifyOutput, true) !== true || load.parameters?.options?.groupMessages !== true) {
  fail('History load must use simplified grouped output.');
}
const insert = node('Insert visible turn');
if (insert.parameters?.mode !== 'insert' || withDefault(insert.parameters?.insertMode, 'insert') !== 'insert') fail('Visible-turn memory write must be an insert operation.');
const messages = insert.parameters?.messages?.messageValues;
if (!Array.isArray(messages) || messages.length !== 2 || messages[0]?.type !== 'user' || messages[1]?.type !== 'ai') fail('Exactly one visible user/assistant pair must be inserted.');
if (!messages.every((message) => withDefault(message.hideFromUI, false) === false)) fail('Visible memory messages must remain visible.');

const memoryConnections = workflow.connections?.['Conversation Simple Memory']?.ai_memory?.flat() ?? [];
for (const target of ['Load prior session messages', 'Insert visible turn']) {
  if (!memoryConnections.some((connection) => connection.node === target)) fail(`Memory backend is not connected to ${target}.`);
}

const requiredCodeNodes = [
  'Validate chat envelope',
  'Build contextualizer request',
  'Validate resolved conversational question',
  'Validate Antigravity answer',
  'Return generalized answer',
  'Return structured generalized error',
  'Return terminal no_match',
  'Normalize chat response',
  'Return chat response',
];
for (const name of requiredCodeNodes) {
  const candidate = node(name);
  if (candidate.type !== 'n8n-nodes-base.code' || typeof candidate.parameters?.jsCode !== 'string') fail(`${name} must be a Code node.`);
  try {
    new Function('$input', '$', candidate.parameters.jsCode);
  } catch (error) {
    fail(`${name} contains invalid JavaScript: ${error.message}`);
  }
}
const resolverCode = node('Build contextualizer request').parameters.jsCode;
if (!resolverCode.includes('history.slice(-16)') || !resolverCode.includes('12000')) fail('Context history bounds are missing.');
const finalRequest = node('Run Antigravity answer').parameters?.body ?? '';
if (!String(finalRequest).includes('tools: []') || !String(finalRequest).includes('$json.model_prompt')) fail('Final Antigravity request contract changed.');
const resolverRequest = node('Resolve conversational question').parameters?.body ?? '';
if (!String(resolverRequest).includes('tools: []') || !String(resolverRequest).includes('$json.resolver_prompt')) fail('Contextualizer request contract changed.');
if (String(finalRequest).includes('conversation_history') || String(finalRequest).includes('resolver_prompt')) fail('Conversation transcript must not enter final answer request.');

const switchNode = node('Resolution status?');
if (switchNode.type !== 'n8n-nodes-base.switch') fail('Resolution status router must be a Switch node.');
if (!String(switchNode.parameters?.output ?? '').includes('resolved: 0') || !String(switchNode.parameters?.output ?? '').includes('error: 3')) fail('Resolution status routing is incomplete.');

const normalizeTargets = workflow.connections?.['Normalize chat response']?.main?.flat() ?? [];
if (!normalizeTargets.some((connection) => connection.node === 'Store visible turn?')) fail('Visible responses must pass through the storage gate.');
const terminalNames = ['Return generalized answer', 'Return terminal no_match', 'Return structured generalized error', 'Return clarification', 'Return help', 'Return resolver error'];
for (const name of terminalNames) {
  const targets = workflow.connections?.[name]?.main?.flat() ?? [];
  if (!targets.some((connection) => connection.node === 'Normalize chat response')) fail(`${name} does not reach response normalization.`);
}
const returnTargets = workflow.connections?.['Insert visible turn']?.main?.flat() ?? [];
if (!returnTargets.some((connection) => connection.node === 'Return chat response')) fail('Memory insert must not be the chat response.');

console.log(`Antigravity chat workflow validation passed (${nodes.length} nodes).`);
