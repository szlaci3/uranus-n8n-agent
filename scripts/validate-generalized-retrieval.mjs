import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const kbRoot = process.argv[2] ? resolve(process.argv[2]) : null;
if (!kbRoot) {
  console.error('Usage: node scripts/validate-generalized-retrieval.mjs <cole-kb-root>');
  process.exit(2);
}

const INDEX_PATHS = [
  'concepts/index.md',
  'entities/tools/index.md',
  'entities/people/index.md',
  'entities/organizations/index.md',
  'sources/index.md',
];
const MAX_CANONICAL_PAGES = 2;
const MAX_EVIDENCE_PAGES = 4;
const MAX_EXCERPT_CHARS = 5000;
const MAX_PACKET_CHARS = 20000;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'cole', 'does', 'for',
  'from', 'how', 'i', 'in', 'into', 'is', 'it', 'mean', 'means', 'of', 'on',
  'or', 'recommend', 'says', 'that', 'the', 'their', 'to', 'what', 'when',
  'why', 'with',
]);

function normalizeToken(token) {
  let value = token.toLowerCase();
  if (value.length > 5 && value.endsWith('ies')) value = `${value.slice(0, -3)}y`;
  else if (value.length > 4 && value.endsWith('ses')) value = value.slice(0, -1);
  else if (value.length > 4 && value.endsWith('s') && !value.endsWith('ss')) value = value.slice(0, -1);
  return value;
}

function tokens(value) {
  return [...new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .map(normalizeToken)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))];
}

function stripFrontmatter(content) {
  if (!content.startsWith('---')) return content.trim();
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? content.slice(match[0].length).trim() : '';
}

function openingSection(content) {
  const body = stripFrontmatter(content);
  const heading = body.search(/\r?\n##\s/);
  return (heading === -1 ? body : body.slice(0, heading)).trim();
}

function canonicalFromIndex(indexPath, relativeLink) {
  const prefix = indexPath.slice(0, indexPath.lastIndexOf('/') + 1);
  return `${prefix}${relativeLink}`.replaceAll('/./', '/');
}

function parseIndex(indexPath) {
  const content = readFileSync(resolve(kbRoot, indexPath), 'utf8');
  const records = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s+\[([^\]]+)]\(([^)]+\.md)\)\s*(?:-\s*(.*))?$/);
    if (!match) continue;
    const [, title, link, description = ''] = match;
    if (link.includes('..') || /^(?:https?:|\/)/i.test(link)) continue;
    const kbPath = canonicalFromIndex(indexPath, link);
    if (!/^(?:concepts|entities\/(?:tools|people|organizations)|sources)\/[A-Za-z0-9][A-Za-z0-9_-]*\.md$/.test(kbPath)) continue;
    if (kbPath.endsWith('/index.md')) continue;
    records.push({ kb_path: kbPath, title, description });
  }
  return records;
}

function scoreRecord(record, question, questionTokens) {
  const titleTokens = tokens(record.title);
  const slugTokens = tokens(record.kb_path.split('/').at(-1).replace(/\.md$/, '').replaceAll('-', ' '));
  const descriptionTokens = new Set(tokens(record.description));
  const titleHits = titleTokens.filter((token) => questionTokens.includes(token)).length;
  const slugHits = slugTokens.filter((token) => questionTokens.includes(token)).length;
  const descriptionHits = questionTokens.filter((token) => descriptionTokens.has(token)).length;
  const normalizedQuestion = tokens(question).join(' ');
  const normalizedTitle = titleTokens.join(' ');
  const exactTitle = normalizedTitle && normalizedQuestion.includes(normalizedTitle) ? 1 : 0;
  const exactSlug = slugTokens.length === 1 && questionTokens.includes(slugTokens[0]) ? 1 : 0;
  return {
    ...record,
    score: exactTitle * 30 + exactSlug * 30 + titleHits * 12 + slugHits * 8 + descriptionHits * 2,
    title_hits: titleHits,
    slug_hits: slugHits,
    exact_title: exactTitle === 1,
    exact_slug: exactSlug === 1,
  };
}

function quotedPhrase(question) {
  return [...question.matchAll(/[“\"]([^”\"]+)[”\"]/g)][0]?.[1]?.trim() ?? null;
}

function deriveLiteralQuery(question) {
  const quoted = quotedPhrase(question);
  if (quoted) return quoted.replace(/^the\s+/i, '').trim();
  return question
    .replace(/[?!.]+$/g, '')
    .replace(/^what\s+does\s+cole\s+recommend\s+for\s+/i, '')
    .replace(/^what\s+does\s+cole\s+(?:say|teach|mean)\s+(?:about|by)?\s*/i, '')
    .trim();
}

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

function literalFallback(query) {
  if (!query || query.length > 120) return [];
  const folded = query.toLowerCase();
  const paths = [];
  for (const directory of ['concepts', 'entities', 'sources']) {
    for (const relative of listMarkdown(resolve(kbRoot, directory))) {
      if (relative.endsWith('/index.md') || relative === 'index.md') continue;
      const kbPath = `${directory}/${relative}`;
      if (readFileSync(resolve(kbRoot, kbPath), 'utf8').toLowerCase().includes(folded)) paths.push(kbPath);
    }
  }
  return paths.sort().slice(0, MAX_CANONICAL_PAGES);
}

function chooseSource(content, questionTokens) {
  const body = stripFrontmatter(content);
  const sourceSectionAt = body.search(/\r?\n## Sources\s*\r?\n/);
  if (sourceSectionAt === -1) return null;
  const lines = body.slice(sourceSectionAt).split(/\r?\n/);
  const candidates = [];
  for (const [order, line] of lines.entries()) {
    const match = line.match(/^\s*-\s+\[[^\]]+]\(\.\.\/sources\/([A-Za-z0-9][A-Za-z0-9_-]*\.md)\)/);
    if (!match) continue;
    const lineTokens = new Set(tokens(line));
    const overlap = questionTokens.filter((token) => lineTokens.has(token)).length;
    candidates.push({ kb_path: `sources/${match[1]}`, line: line.trim(), overlap, order });
  }
  candidates.sort((left, right) => right.overlap - left.overlap || left.order - right.order || left.kb_path.localeCompare(right.kb_path));
  return candidates[0] ?? null;
}

function buildPacket(question) {
  const questionTokens = tokens(question);
  const records = INDEX_PATHS.flatMap(parseIndex);
  const quoted = quotedPhrase(question)?.replace(/^the\s+/i, '').trim().toLowerCase() ?? null;
  const quotedAppearsInIndex = quoted
    ? records.some((record) => `${record.title} ${record.description}`.toLowerCase().includes(quoted))
    : true;
  const ranked = (quotedAppearsInIndex ? records : [])
    .map((record) => scoreRecord(record, question, questionTokens))
    .filter((record) => record.score >= 12 && (record.title_hits > 0 || record.slug_hits > 0))
    .filter((record) => !record.kb_path.startsWith('sources/') || record.exact_title)
    .sort((left, right) => right.score - left.score || right.title_hits - left.title_hits || right.slug_hits - left.slug_hits || left.kb_path.localeCompare(right.kb_path));
  const indexedPaths = [...new Set(ranked.map((record) => record.kb_path))].slice(0, MAX_CANONICAL_PAGES);
  const literalQuery = indexedPaths.length === 0 ? deriveLiteralQuery(question) : null;
  const canonicalPaths = indexedPaths.length > 0 ? indexedPaths : literalFallback(literalQuery);
  if (canonicalPaths.length === 0) {
    return { status: 'no_match', terminal: true, question, literal_query: literalQuery, model_actions: 0 };
  }

  const canonicalEvidence = [];
  const sources = new Map();
  for (const kbPath of canonicalPaths) {
    const content = readFileSync(resolve(kbRoot, kbPath), 'utf8');
    const excerpt = openingSection(content);
    if (!excerpt || excerpt.length > MAX_EXCERPT_CHARS) throw new Error(`Canonical excerpt bound failed: ${kbPath} (${excerpt.length})`);
    const source = kbPath.startsWith('sources/') ? null : chooseSource(content, questionTokens);
    canonicalEvidence.push({
      kb_path: kbPath,
      source_path: `knowledge/cole-medin-knowledge-base/${kbPath}`,
      role: kbPath.startsWith('sources/') ? 'canonical_source' : 'canonical_page',
      excerpt: source ? `${excerpt}\n\n## Selected linked source\n\n${source.line}` : excerpt,
      linked_sources: source ? [source.kb_path] : [],
    });
    if (source) sources.set(source.kb_path, source);
  }

  const sourceEvidence = [];
  for (const source of sources.values()) {
    const content = readFileSync(resolve(kbRoot, source.kb_path), 'utf8');
    const excerpt = openingSection(content);
    if (!excerpt || excerpt.length > MAX_EXCERPT_CHARS) throw new Error(`Source excerpt bound failed: ${source.kb_path} (${excerpt.length})`);
    sourceEvidence.push({
      kb_path: source.kb_path,
      source_path: `knowledge/cole-medin-knowledge-base/${source.kb_path}`,
      role: 'linked_source',
      excerpt,
      linked_sources: [],
    });
  }

  const evidence = [...canonicalEvidence, ...sourceEvidence];
  if (evidence.length > MAX_EVIDENCE_PAGES) throw new Error(`Evidence page bound failed: ${evidence.length}`);
  const packet = {
    schema: 'uranus-evidence-packet-2',
    question,
    selection_method: indexedPaths.length > 0 ? 'deterministic_index_score' : 'keyword_literal',
    literal_query: literalQuery,
    route: evidence.map((entry) => entry.kb_path),
    evidence,
    limits: {
      max_canonical_pages: MAX_CANONICAL_PAGES,
      max_evidence_pages: MAX_EVIDENCE_PAGES,
      max_excerpt_chars_per_page: MAX_EXCERPT_CHARS,
      max_packet_chars: MAX_PACKET_CHARS,
    },
  };
  const packetJson = JSON.stringify(packet, null, 2);
  if (packetJson.length > MAX_PACKET_CHARS) throw new Error(`Packet bound failed: ${packetJson.length}`);
  return { status: 'success', packet, packet_characters: packetJson.length, ranked: ranked.slice(0, 5) };
}

const cases = [
  'Why does chunking matter in RAG?',
  'How are chunking and a knowledge base related?',
  'When is RAG useful and what role does chunking play?',
  'What does Cole mean when he says an LLM gets into “the dumb zone”?',
  'What does Cole recommend for Kubernetes cluster autoscaling?',
];

const expected = [
  ['concepts/chunking.md'],
  ['concepts/knowledge-bases.md', 'concepts/chunking.md'],
  ['concepts/chunking.md', 'concepts/rag.md'],
  ['concepts/context-rot.md'],
  [],
];

for (const [index, question] of cases.entries()) {
  const result = buildPacket(question);
  if (expected[index].length === 0) {
    if (result.status !== 'no_match' || result.model_actions !== 0) throw new Error(`Case ${index + 1} should be terminal no_match.`);
    console.log(`Case ${index + 1}: terminal no_match (${result.literal_query})`);
    continue;
  }
  if (result.status !== 'success') throw new Error(`Case ${index + 1} did not produce a packet.`);
  const actualCanonical = result.packet.evidence.filter((entry) => entry.role !== 'linked_source').map((entry) => entry.kb_path);
  for (const required of expected[index]) {
    if (!actualCanonical.includes(required)) throw new Error(`Case ${index + 1} missing ${required}: ${actualCanonical.join(', ')}`);
  }
  console.log(`Case ${index + 1}: ${result.packet.selection_method}; ${result.packet_characters} chars; ${result.packet.route.join(' -> ')}`);
}

console.log('Generalized deterministic retrieval validation passed.');
