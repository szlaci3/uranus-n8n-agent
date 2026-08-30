import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const suppliedRoot = process.argv[2];
if (!suppliedRoot) {
  console.error('Usage: node scripts/validate-pilot-packet.mjs <cole-kb-root>');
  process.exitCode = 2;
} else {
  const kbRoot = resolve(suppliedRoot);
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const workflow = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'workflows/miranda-one-call-pilot.json'), 'utf8'),
  );
  const assemble = workflow.nodes.find(
    (node) => node.name === 'Assemble bounded evidence packet',
  );
  if (!assemble) throw new Error('Pilot packet-assembly node is missing.');

  const paths = [
    'concepts/context-rot.md',
    'sources/are-agent-harnesses-bringing-back-vibe-coding.md',
  ];
  const items = paths.map((kbPath) => ({
    json: {
      status: 'ready',
      kb_path: kbPath,
      source_path: `knowledge/cole-medin-knowledge-base/${kbPath}`,
      content: readFileSync(resolve(kbRoot, kbPath), 'utf8'),
    },
  }));

  const execute = new Function('$input', assemble.parameters.jsCode);
  const output = execute({ all: () => items });
  const result = output?.[0]?.json;
  if (result?.status !== 'success' || result?._packet_ready !== true) {
    throw new Error(`Pilot packet assembly failed: ${JSON.stringify(result)}`);
  }

  const packet = result.evidence_packet;
  if (packet.schema !== 'uranus-evidence-packet-1') throw new Error('Packet schema changed.');
  if (packet.evidence.length !== 2) throw new Error('Packet must contain exactly two evidence items.');
  if (JSON.stringify(packet.route) !== JSON.stringify(paths)) throw new Error('Packet route changed.');
  if (result.packet_characters > packet.limits.max_packet_chars) throw new Error('Packet exceeds its bound.');
  if (packet.evidence.some((entry) => entry.excerpt.length > packet.limits.max_excerpt_chars_per_page)) {
    throw new Error('An evidence excerpt exceeds its bound.');
  }
  if (!packet.evidence[0].excerpt.includes('gets into the dumb zone')) {
    throw new Error('The concept evidence does not contain the Q4 claim.');
  }
  if (!packet.evidence[1].excerpt.includes('**[0:19:21]**')) {
    throw new Error('The source evidence does not contain the linked Q4 key moment.');
  }
  if (!isAbsolute(kbRoot)) throw new Error('Resolved KB root must be absolute.');

  console.log('Pilot packet validation passed.');
  console.log(`- Evidence packet: ${result.packet_characters} characters.`);
  for (const entry of packet.evidence) {
    console.log(`- ${entry.kb_path}: ${entry.excerpt.length} excerpt characters.`);
  }
  console.log('- Canonical Q4 claim, linked source, route, and bounds are present.');
}
