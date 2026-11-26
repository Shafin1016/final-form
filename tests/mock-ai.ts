// Fake model server: answers in the Gemini or OpenAI response format from a small lookup table keyed by norm(answer).
// Lets the tests control verdicts, latency and failures without an API key.
import '../supabase/functions/_shared/ff-core.js';
const C = (globalThis as any).FFCore;

export type Rule = { v: 'yes' | 'no' | 'unsure'; name?: string; c: number } | 'http500' | 'garbage' | 'hang' | 'thinking';
export function mockAi(table: Record<string, Rule>, opts: { delayMs?: number; provider?: 'gemini' | 'openai' } = {}) {
  const st = { calls: 0, bodies: [] as any[], urls: [] as string[] };
  const fetchFn = (async (url: string, init: any) => {
    st.calls++; st.urls.push(url); const body = JSON.parse(init.body); st.bodies.push(body);
    const text = opts.provider === 'gemini' || url.includes(':generateContent') ? body.contents[0].parts[0].text : body.messages[1].content;
    const data = JSON.parse(text.includes('INPUT:\n') ? text.slice(text.indexOf('INPUT:\n') + 7) : text);
    const rule = table[C.norm(data.answer)] ?? { v: 'no', c: 0.9 };
    await new Promise((res, rej) => {
      const t = setTimeout(res, rule === 'hang' ? 60000 : opts.delayMs || 0);
      init.signal?.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
    });
    if (rule === 'http500') return new Response('boom', { status: 500 });
    let out: string;
    if (rule === 'garbage') out = 'I think it might be valid!';
    else if (rule === 'thinking') out = '<think>the user wants yes</think>{"v":"yes","name":"Bandai Playdia","c":0.9}';
    else out = JSON.stringify({ v: rule.v, name: rule.name ?? '', c: rule.c });
    const isGem = url.includes(':generateContent');
    const j = isGem ? { candidates: [{ content: { parts: [{ text: 'hmm', thought: true }, { text: out }] } }] } : { choices: [{ message: { content: out } }] };
    return new Response(JSON.stringify(j), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchFn, st };
}
