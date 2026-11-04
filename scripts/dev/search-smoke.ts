import { searchAao } from '../../src/lib/aao/retrieval';
for (const q of ['published material about the company rather than the beneficiary', 'membership requires outstanding achievements judged by experts']) {
  const hits = await searchAao(q, { k: 3 });
  console.log(`\n> ${q}`);
  for (const h of hits) console.log(`  ${h.decisionId} ${h.score.toFixed(4)} ${h.content.slice(0, 140).replace(/\s+/g, ' ')}…`);
}
process.exit(0);
