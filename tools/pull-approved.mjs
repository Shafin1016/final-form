#!/usr/bin/env node
// Turns answers a reviewer approved in the live database into a proposal for the hand-written bank,
// so the game knows them offline too (and the next deploy doesn't need the database for them).
//   FF_API=https://REF.supabase.co/functions/v1/ff ADMIN_TOKEN=... node tools/pull-approved.mjs
//   then: node tools/apply-expansion.mjs expansions/approved-....json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadBank, fileOf, env } from './lib.mjs';

const api = env('FF_API').replace(/\/$/, ''), tok = env('ADMIN_TOKEN');
if (!api || !tok) { console.error('set FF_API and ADMIN_TOKEN'); process.exit(2); }
const r = await fetch(api + '/admin/export', { headers: { Authorization: 'Bearer ' + tok } });
if (!r.ok) { console.error('export failed', r.status, await r.text()); process.exit(1); }
const { approved } = await r.json(), { core, prompts } = loadBank(), by = new Map();
for (const a of approved) {
  const p = prompts.find(q => q.id === a.prompt_id); if (!p) continue;
  const e = by.get(p.id) || { id: p.id, file: fileOf(p.id), q: p.q, new: [], aliases: [], skipped: [] }; by.set(p.id, e);
  const bankAns = p.answers.find(x => x.key === a.key) || core.match(p, a.name).ans;
  const aliases = (a.aliases || []).filter(k => k && !p.keys.has(k));
  if (bankAns) { if (aliases.length) e.aliases.push({ answer: bankAns.name, key: bankAns.key, add: aliases, accept: true }); }
  else e.new.push({ name: a.name, aliases: aliases.filter(k => k !== core.norm(a.name)), c: 1, tier: a.tier || 'A', verified: { site: 'review' }, accept: true });
}
const out = path.join(ROOT, 'expansions', `approved-${new Date().toISOString().slice(0, 10)}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ created: new Date().toISOString(), source: 'reviewed answers from the live database', prompts: [...by.values()] }, null, 2));
console.log(`${approved.length} approved answers -> ${path.relative(process.cwd(), out)}`);
