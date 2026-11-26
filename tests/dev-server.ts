// Local stand-in for production: serves the game and runs the real backend handler with an in-memory DB
// and a fake model (or a real provider if AI_API_KEY is set). For browser tests and trying things out.
//   bun tests/dev-server.ts            -> http://localhost:8790/?fast   (game uses /functions/v1/ff on the same host)
//   DB_MS=40 AI_MS=600 bun tests/dev-server.ts   simulate network/model latency
import { makeApp } from '../supabase/functions/ff/handler.ts';
import { memoryStore } from './memory-store.ts';
import { mockAi } from './mock-ai.ts';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..'), PORT = Number(process.env.PORT || 8790);
const store = memoryStore({ latencyMs: Number(process.env.DB_MS || 0) });
const fake = mockAi({
  bandaiplaydia: { v: 'yes', name: 'Bandai Playdia', c: 0.95 }, playdia: { v: 'yes', name: 'Bandai Playdia', c: 0.9 },
  nuon: { v: 'unsure', c: 0.3 }, crashme: 'http500', slowpoke: 'hang', sfc: { v: 'yes', name: 'Super Famicom', c: 0.9 },
  // a few for other prompts
  kinemon: { v: 'yes', name: 'Kin\'emon', c: 0.6 }, pedro: { v: 'no', c: 0.9 },
}, { delayMs: Number(process.env.AI_MS || 300) });
const real = process.env.AI_API_KEY;
const app = makeApp(store, {
  provider: (process.env.AI_PROVIDER as any) || 'gemini', model: process.env.AI_MODEL || 'gemma-4-26b-a4b-it', baseUrl: process.env.AI_BASE_URL || '',
  apiKey: real || 'fake', timeoutMs: Number(process.env.AI_TIMEOUT_MS || 2500), maxTokens: 60, extraBody: null,
}, { allowedOrigins: ['*'], adminToken: process.env.ADMIN_TOKEN || 'dev-admin', cacheTtlMs: 5000 }, real ? {} : { fetchFn: fake.fetchFn });

Bun.serve({
  port: PORT,
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname.startsWith('/functions/v1/ff')) return app(req);
    if (u.pathname === '/__stats') return Response.json({ aiCalls: fake.st.calls, logs: store._.logs, runs: store._.runs.size, answers: [...store._.A.values()], verdicts: [...store._.V.values()] });
    if (u.pathname === '/ff-config.js') return new Response(`window.FF_CONFIG = { api: location.origin + '/functions/v1/ff', aiCheck: true, aiPerRound: 5, validateTimeoutMs: ${Number(process.env.CLIENT_TIMEOUT_MS || 4500)} };`, { headers: { 'Content-Type': 'text/javascript' } });
    const f = Bun.file(path.join(ROOT, path.normalize(u.pathname === '/' ? '/index.html' : u.pathname)));
    return (await f.exists()) ? new Response(f) : new Response('not found', { status: 404 });
  },
});
console.log(`dev server on http://localhost:${PORT}  (${real ? 'REAL model' : 'fake model'})`);
