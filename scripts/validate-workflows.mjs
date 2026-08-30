import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflowPaths = {
  chat: resolve(repositoryRoot, 'workflows/miranda-chat-gemini.json'),
  kb: resolve(repositoryRoot, 'workflows/kb-navigation.json'),
  pilot: resolve(repositoryRoot, 'workflows/miranda-one-call-pilot.json'),
};
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function loadJson(label, path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    failures.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function nodeByName(workflow, name) {
  return workflow.nodes.find((node) => node.name === name);
}

function hasEdge(workflow, source, connectionType, target) {
  const groups = workflow.connections?.[source]?.[connectionType] ?? [];
  return groups.some((group) => group.some((edge) => edge.node === target));
}

function validateCommon(label, workflow) {
  check(workflow.active === false, `${label} must be inactive`);
  check(workflow.pinData && Object.keys(workflow.pinData).length === 0, `${label} must have empty pinData`);
  check(!Object.hasOwn(workflow, 'id'), `${label} must not contain an instance workflow id`);
  check(!Object.hasOwn(workflow, 'versionId'), `${label} must not contain versionId`);
  check(!Object.hasOwn(workflow, 'meta'), `${label} must not contain instance metadata`);

  const names = workflow.nodes.map((node) => node.name);
  check(new Set(names).size === names.length, `${label} must have unique node names`);

  const nameSet = new Set(names);
  for (const [source, ports] of Object.entries(workflow.connections ?? {})) {
    check(nameSet.has(source), `${label} has unknown connection source: ${source}`);
    for (const groups of Object.values(ports)) {
      for (const group of groups) {
        for (const edge of group) {
          check(nameSet.has(edge.node), `${label} has unknown connection target: ${edge.node}`);
        }
      }
    }
  }

  for (const node of workflow.nodes) {
    check(!Object.hasOwn(node, 'credentials'), `${label}/${node.name} must not contain a credential reference`);
    check(!Object.hasOwn(node, 'webhookId'), `${label}/${node.name} must not contain a webhook id`);
    if (node.type === 'n8n-nodes-base.code') {
      try {
        // Parse only. n8n runtime globals are intentionally not executed here.
        new Function(node.parameters.jsCode);
      } catch (error) {
        failures.push(`${label}/${node.name} JavaScript does not parse: ${error.message}`);
      }
    }
  }

  const serialized = JSON.stringify(workflow);
  for (const forbiddenKey of ['instanceId', 'cachedResultUrl', 'N8N_ENCRYPTION_KEY']) {
    check(!serialized.includes(forbiddenKey), `${label} contains forbidden private/runtime field: ${forbiddenKey}`);
  }
  check(!/AIza[0-9A-Za-z_-]{20,}/.test(serialized), `${label} appears to contain a Google API key`);
}

const chat = loadJson('chat workflow', workflowPaths.chat);
const kb = loadJson('KB workflow', workflowPaths.kb);
const pilot = loadJson('one-call pilot workflow', workflowPaths.pilot);

if (chat) {
  validateCommon('chat workflow', chat);
  check(chat.name === 'miranda-chat', 'chat workflow name must remain miranda-chat');
  check(chat.nodes.length === 5, 'chat workflow must contain the five accepted Stage 2B nodes');

  const expectedNames = new Set([
    'When chat message received',
    'Miranda',
    'read_kb_page',
    'find_kb_pages',
    'Gemini 3.5 Flash',
  ]);
  check(chat.nodes.every((node) => expectedNames.has(node.name)), 'chat workflow contains an unexpected node');
  check(!chat.nodes.some((node) => /qwen|ollama/i.test(`${node.name} ${node.type}`)), 'chat workflow must not contain Qwen or Ollama');

  const trigger = nodeByName(chat, 'When chat message received');
  const miranda = nodeByName(chat, 'Miranda');
  const readTool = nodeByName(chat, 'read_kb_page');
  const findTool = nodeByName(chat, 'find_kb_pages');
  const gemini = nodeByName(chat, 'Gemini 3.5 Flash');

  check(trigger?.type === '@n8n/n8n-nodes-langchain.chatTrigger' && trigger.typeVersion === 1.4, 'Chat Trigger type/version changed');
  check(miranda?.type === '@n8n/n8n-nodes-langchain.agent' && miranda.typeVersion === 3.1, 'Miranda type/version changed');
  check(readTool?.type === '@n8n/n8n-nodes-langchain.toolWorkflow' && readTool.typeVersion === 2.2, 'read_kb_page type/version changed');
  check(findTool?.type === '@n8n/n8n-nodes-langchain.toolWorkflow' && findTool.typeVersion === 2.2, 'find_kb_pages type/version changed');
  check(gemini?.type === '@n8n/n8n-nodes-langchain.lmChatGoogleGemini' && gemini.typeVersion === 1.1, 'Gemini type/version changed');
  check(gemini?.parameters?.modelName === 'models/gemini-3.5-flash', 'Gemini model must be models/gemini-3.5-flash');
  check(miranda?.parameters?.options?.maxIterations === 8, 'Miranda maxIterations must remain 8');

  check(hasEdge(chat, 'When chat message received', 'main', 'Miranda'), 'Chat Trigger must connect to Miranda');
  check(hasEdge(chat, 'read_kb_page', 'ai_tool', 'Miranda'), 'read_kb_page must connect to Miranda');
  check(hasEdge(chat, 'find_kb_pages', 'ai_tool', 'Miranda'), 'find_kb_pages must connect to Miranda');
  check(hasEdge(chat, 'Gemini 3.5 Flash', 'ai_languageModel', 'Miranda'), 'Gemini must be the connected language model');

  check(readTool?.parameters?.workflowInputs?.value?.operation === 'read', 'read_kb_page must fix operation=read');
  check(findTool?.parameters?.workflowInputs?.value?.operation === 'find', 'find_kb_pages must fix operation=find');
  check(readTool?.parameters?.workflowId?.value === '', 'read_kb_page must not publish a private workflow binding');
  check(findTool?.parameters?.workflowId?.value === '', 'find_kb_pages must not publish a private workflow binding');

  const acceptedHashes = {
    prompt: '14425f24172666c71ee53c8a08a26fb3c7f5285f129351be751ea49eab4cc825',
    readDescription: 'ea16efae0fc4f7bf1fc1501316a55ede25708bff6ea4aa068a2009bc8e9eb576',
    findDescription: 'fdbc7751ae3fe5c172ac5142d27365e3cb084b5ac26e3fa15665fcd92e20a60c',
  };
  check(sha256(miranda?.parameters?.options?.systemMessage ?? '') === acceptedHashes.prompt, 'accepted Miranda prompt changed');
  check(sha256(readTool?.parameters?.description ?? '') === acceptedHashes.readDescription, 'accepted read_kb_page description changed');
  check(sha256(findTool?.parameters?.description ?? '') === acceptedHashes.findDescription, 'accepted find_kb_pages description changed');
}

if (kb) {
  validateCommon('KB workflow', kb);
  check(kb.name === 'kb-navigation', 'KB workflow name must remain kb-navigation');
  check(kb.nodes.length === 16, 'KB workflow must contain the 16 accepted Stage 2B nodes');

  const trigger = nodeByName(kb, 'When Executed by Another Workflow');
  const inputNames = trigger?.parameters?.workflowInputs?.values?.map((entry) => entry.name) ?? [];
  check(['operation', 'page_path', 'query'].every((name) => inputNames.includes(name)), 'KB workflow must expose operation, page_path, and query');

  const expectedCodeHashes = {
    'Validate request': '6784edc73673f149f2564088b71bef7e5dcb627855e813e2bf454fe6998b57c0',
    'Check file read and size': '4f7f76c3be7405ef28c1d0ecd7a91bbfdfe2abb7b2e6eb7a49e37a8e3c5f3860',
    'Return structured result': '085223c0e577cdf2e98741733e6c27ee4e672bc59e7a6ba98ab5770e80f2513e',
    'Validate scoped search files': '47d5b3d2b2969e87d92836b12e9510993b0c228f19b68c4b7e2eb329f01e4aa5',
    'Return keyword candidates': '5a0a59293979b411eb63aeb9120bfe1aabb184fb8da3ce0b44be809db2c93474',
  };
  for (const [name, expectedHash] of Object.entries(expectedCodeHashes)) {
    const node = nodeByName(kb, name);
    check(Boolean(node), `KB workflow is missing Code node: ${name}`);
    check(sha256(node?.parameters?.jsCode ?? '') === expectedHash, `accepted JavaScript changed in: ${name}`);
  }

  const validationCode = nodeByName(kb, 'Validate request')?.parameters?.jsCode ?? '';
  const candidateCode = nodeByName(kb, 'Return keyword candidates')?.parameters?.jsCode ?? '';
  check(validationCode.includes("const MAX_BYTES = 131072;"), 'KB page-size limit changed');
  check(validationCode.includes("const MAX_QUERY_CHARS = 120;"), 'KB query-length limit changed');
  check(validationCode.includes("const RESULT_CAP = 5;"), 'KB candidate cap changed');
  check(candidateCode.includes("status: 'no_match', terminal: true"), 'terminal no_match behavior changed');
}

if (pilot) {
  validateCommon('one-call pilot workflow', pilot);
  check(pilot.name === 'miranda-one-call-pilot', 'pilot workflow name must remain miranda-one-call-pilot');
  check(pilot.nodes.length === 14, 'pilot workflow must contain the 14 reviewed nodes');

  const expectedNames = new Set([
    'When clicking ‘Execute workflow’',
    'Manual test — exact Q4',
    'Validate exact Q4 and emit frozen route',
    'Frozen route approved?',
    'Read frozen canonical pages',
    'Validate frozen page reads',
    'Frozen pages approved?',
    'Decode canonical Markdown as UTF-8',
    'Assemble bounded evidence packet',
    'Evidence packet approved?',
    'One Gemini answer call',
    'Gemini 3.5 Flash',
    'Return pilot answer and measurement fields',
    'Return structured pilot error',
  ]);
  check(pilot.nodes.every((node) => expectedNames.has(node.name)), 'pilot workflow contains an unexpected node');
  check(!pilot.nodes.some((node) => node.type === '@n8n/n8n-nodes-langchain.agent'), 'pilot workflow must not contain an AI Agent');
  check(!pilot.nodes.some((node) => node.type === '@n8n/n8n-nodes-langchain.toolWorkflow'), 'pilot workflow must not contain an agent workflow tool');
  check(!pilot.nodes.some((node) => node.type === 'n8n-nodes-base.executeWorkflowTrigger'), 'pilot workflow must not be callable as a sub-workflow');

  const manual = nodeByName(pilot, 'When clicking ‘Execute workflow’');
  const route = nodeByName(pilot, 'Validate exact Q4 and emit frozen route');
  const read = nodeByName(pilot, 'Read frozen canonical pages');
  const assemble = nodeByName(pilot, 'Assemble bounded evidence packet');
  const chain = nodeByName(pilot, 'One Gemini answer call');
  const gemini = nodeByName(pilot, 'Gemini 3.5 Flash');
  const result = nodeByName(pilot, 'Return pilot answer and measurement fields');

  check(manual?.type === 'n8n-nodes-base.manualTrigger' && manual.typeVersion === 1, 'pilot manual trigger type/version changed');
  check(read?.type === 'n8n-nodes-base.readWriteFile' && read.typeVersion === 1.1, 'pilot file-read type/version changed');
  check(read?.parameters?.fileSelector === '={{ $json.absolute_path }}', 'pilot file read must use only the validated fixed absolute path');
  check(chain?.type === '@n8n/n8n-nodes-langchain.chainLlm' && chain.typeVersion === 1.9, 'pilot Basic LLM Chain type/version changed');
  check(chain?.parameters?.promptType === 'define' && chain.parameters.text === '={{ $json.model_prompt }}', 'pilot chain must use the validated packet prompt');
  check(gemini?.type === '@n8n/n8n-nodes-langchain.lmChatGoogleGemini' && gemini.typeVersion === 1.1, 'pilot Gemini type/version changed');
  check(gemini?.parameters?.modelName === 'models/gemini-3.5-flash', 'pilot model must be models/gemini-3.5-flash');

  check(hasEdge(pilot, 'When clicking ‘Execute workflow’', 'main', 'Manual test — exact Q4'), 'pilot manual trigger must feed the exact Q4 input');
  check(hasEdge(pilot, 'Read frozen canonical pages', 'main', 'Validate frozen page reads'), 'pilot reads must pass through deterministic validation');
  check(hasEdge(pilot, 'Decode canonical Markdown as UTF-8', 'main', 'Assemble bounded evidence packet'), 'pilot decoded pages must feed packet assembly');
  check(hasEdge(pilot, 'Evidence packet approved?', 'main', 'One Gemini answer call'), 'only an approved packet may reach Gemini');
  check(hasEdge(pilot, 'Gemini 3.5 Flash', 'ai_languageModel', 'One Gemini answer call'), 'pilot Gemini must connect directly to the one answer chain');
  check(hasEdge(pilot, 'One Gemini answer call', 'main', 'Return pilot answer and measurement fields'), 'pilot answer must expose measurement fields');

  const routeCode = route?.parameters?.jsCode ?? '';
  const assembleCode = assemble?.parameters?.jsCode ?? '';
  const resultCode = result?.parameters?.jsCode ?? '';
  const exactQuestion = 'What does Cole mean when he says an LLM gets into “the dumb zone”?';
  check(routeCode.includes(exactQuestion), 'pilot exact Q4 question changed');
  check(routeCode.includes("const MAX_BYTES = 131072;"), 'pilot per-page byte limit changed');
  check(routeCode.includes("'concepts/context-rot.md'"), 'pilot canonical concept path changed');
  check(routeCode.includes("'sources/are-agent-harnesses-bringing-back-vibe-coding.md'"), 'pilot linked source path changed');
  check(assembleCode.includes('const MAX_PAGES = 2;'), 'pilot page-count bound changed');
  check(assembleCode.includes('const MAX_EXCERPT_CHARS_PER_PAGE = 5000;'), 'pilot per-excerpt bound changed');
  check(assembleCode.includes('const MAX_PACKET_CHARS = 10000;'), 'pilot packet bound changed');
  check(assembleCode.includes("schema: 'uranus-evidence-packet-1'"), 'pilot packet schema changed');
  check(assembleCode.includes("query: 'dumb zone'"), 'pilot recorded literal fallback query changed');
  check(assembleCode.includes("operation: 'find_kb_pages'"), 'pilot control trace no longer records fallback');
  check(assembleCode.includes("operation: 'read_kb_page'"), 'pilot control trace no longer records page reads');
  check(resultCode.includes('expected_model_actions_on_success: 1'), 'pilot one-call measurement contract changed');
}

if (failures.length > 0) {
  console.error('Workflow artifact validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Workflow artifact validation passed.');
  console.log('- Accepted Gemini Stage 2B topology and behavioral fields are preserved.');
  console.log('- Workflow exports are inactive, unpinned, credential-free, and instance-neutral.');
  console.log('- The isolated Q4 one-call pilot is bounded and cannot alter the accepted baseline workflows.');
  console.log('- Embedded Code-node JavaScript parses successfully.');
  console.log('This is static artifact validation, not automated AI evaluation.');
}
