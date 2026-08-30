import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const suppliedRoot = process.argv[2];
if (!suppliedRoot) {
  console.error('Usage: node scripts/validate-generalized-workflow.mjs <cole-kb-root>');
  process.exit(2);
}

const kbRoot = resolve(suppliedRoot);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = JSON.parse(readFileSync(resolve(repositoryRoot, 'workflows/miranda-one-call-generalized.json'), 'utf8'));
const node = (name) => workflow.nodes.find((candidate) => candidate.name === name);
const selectCode = node('Select deterministic index candidates')?.parameters?.jsCode;
const fallbackCode = node('Select literal fallback candidates')?.parameters?.jsCode;
const prepareCode = node('Prepare canonical evidence and source requests')?.parameters?.jsCode;
const assembleCode = node('Assemble generalized evidence packet')?.parameters?.jsCode;
const finalBoundsCode = node('Validate final packet bounds')?.parameters?.jsCode;
if (![selectCode, fallbackCode, prepareCode, assembleCode, finalBoundsCode].every(Boolean)) throw new Error('A generalized workflow Code node is missing.');

const INDEX_PATHS = ['concepts/index.md', 'entities/tools/index.md', 'entities/people/index.md', 'entities/organizations/index.md', 'sources/index.md'];
const indexItems = INDEX_PATHS.map((kbPath) => ({ json: { kb_path: kbPath, content: readFileSync(resolve(kbRoot, kbPath), 'utf8') } }));

function listMarkdown(rootPath, prefix = '') {
  const output = [];
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = resolve(rootPath, entry.name);
    if (entry.isDirectory()) output.push(...listMarkdown(absolute, relative));
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(relative);
  }
  return output;
}

const fallbackItems = ['concepts', 'entities', 'sources'].flatMap((directory) =>
  listMarkdown(resolve(kbRoot, directory)).map((relative) => {
    const kbPath = `${directory}/${relative}`;
    return { json: { kb_path: kbPath, content: readFileSync(resolve(kbRoot, kbPath), 'utf8') } };
  }),
);

function n8nLookup(values) {
  return (name) => ({
    first: () => ({ json: values[name][0].json }),
    all: () => values[name],
  });
}

function execute(code, inputItems, values) {
  return new Function('$input', '$', code)(
    { all: () => inputItems, first: () => inputItems[0] },
    n8nLookup(values),
  );
}

const cases = [
  { question: 'Why does chunking matter in RAG?', required: ['concepts/chunking.md', 'concepts/rag.md'] },
  { question: 'How are chunking and a knowledge base related?', required: ['concepts/chunking.md', 'concepts/knowledge-bases.md'] },
  { question: 'When is RAG useful and what role does chunking play?', required: ['concepts/chunking.md', 'concepts/rag.md'] },
  { question: 'What does Cole mean when he says an LLM gets into “the dumb zone”?', required: ['concepts/context-rot.md'], method: 'keyword_literal' },
  { question: 'What does Cole recommend for Kubernetes cluster autoscaling?', required: [], noMatch: true },
];

for (const [caseIndex, test] of cases.entries()) {
  const manual = [{ json: { question: test.question } }];
  const values = { 'Manual test — set question': manual };
  let selected = execute(selectCode, indexItems, values);
  values['Select deterministic index candidates'] = selected;
  if (selected[0].json._needs_fallback) {
    selected = execute(fallbackCode, fallbackItems, values);
    values['Select literal fallback candidates'] = selected;
  }

  if (test.noMatch) {
    if (selected.length !== 1 || selected[0].json.status !== 'no_match' || selected[0].json._has_candidate !== false) {
      throw new Error(`Case ${caseIndex + 1} should return terminal no_match.`);
    }
    console.log(`Workflow case ${caseIndex + 1}: terminal no_match (${selected[0].json.query})`);
    continue;
  }

  const selectedPaths = selected.map((item) => item.json.kb_path);
  for (const required of test.required) {
    if (!selectedPaths.includes(required)) throw new Error(`Case ${caseIndex + 1} missing ${required}: ${selectedPaths.join(', ')}`);
  }
  const canonicalItems = selectedPaths.map((kbPath) => ({ json: { kb_path: kbPath, source_path: `knowledge/cole-medin-knowledge-base/${kbPath}`, content: readFileSync(resolve(kbRoot, kbPath), 'utf8') } }));
  const prepared = execute(prepareCode, canonicalItems, values);
  values['Prepare canonical evidence and source requests'] = prepared;
  const sourceItems = prepared[0].json.source_requests.map((request) => ({ json: { kb_path: request.kb_path, source_path: request.source_path, content: readFileSync(resolve(kbRoot, request.kb_path), 'utf8') } }));
  const assembled = execute(assembleCode, sourceItems.length ? sourceItems : prepared, values);
  const bounded = execute(finalBoundsCode, assembled, values);
  const result = bounded[0].json;
  if (result.status !== 'success' || result._packet_ready !== true) throw new Error(`Case ${caseIndex + 1} packet failed: ${JSON.stringify(result)}`);
  if (result.evidence_packet.schema !== 'uranus-evidence-packet-2') throw new Error(`Case ${caseIndex + 1} schema changed.`);
  if (result.evidence_packet.evidence.length > 4 || result.packet_characters > 20000) throw new Error(`Case ${caseIndex + 1} exceeded packet bounds.`);
  if (test.method && result.selection_method !== test.method) throw new Error(`Case ${caseIndex + 1} used ${result.selection_method}, expected ${test.method}.`);
  for (const entry of result.evidence_packet.evidence) {
    if (!entry.excerpt || entry.excerpt.length > 5000) throw new Error(`Case ${caseIndex + 1} excerpt bound failed: ${entry.kb_path}`);
  }
  console.log(`Workflow case ${caseIndex + 1}: ${result.selection_method}; ${result.packet_characters} chars; ${result.evidence_paths.join(' -> ')}`);
}

console.log('Generalized n8n workflow logic validation passed.');
