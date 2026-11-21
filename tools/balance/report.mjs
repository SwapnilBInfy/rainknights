// Aggregate tools/balance/out/fights.jsonl into a table: node tools/balance/report.mjs
import { readFileSync } from 'node:fs';
const rows = readFileSync('tools/balance/out/fights.jsonl', 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const groups = new Map();
for (const r of rows) {
  const k = `${r.scenario}|${r.level}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log('| scenario | knight Lv | trials | died | median s | avg HP lost (of max) |');
console.log('|---|---|---|---|---|---|');
for (const [k, g] of [...groups].sort()) {
  const [scenario, level] = k.split('|');
  const died = g.filter((r) => r.died).length;
  const lost = g.reduce((n, r) => n + Math.min(1.5, r.hpLost / r.maxHp), 0) / g.length;
  console.log(`| ${scenario} | ${level} | ${g.length} | ${died} (${Math.round((died / g.length) * 100)}%) | ${med(g.map((r) => r.seconds))} | ${Math.round(lost * 100)}% |`);
}
