const { sql } = require('./_db');
const { verify } = require('./_auth');

const DAILY_LIMIT = 5;
const MODEL = 'claude-haiku-4-5-20251001';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const payload = verify(req);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI көмекші әлі қосылмаған (кілт орнатылмаған)' });
  }

  try {
    const acc = await sql`select active, ai_calls_today, ai_calls_reset_at from users where id = ${payload.uid}`;
    if (!acc[0] || !acc[0].active) return res.status(403).json({ error: 'Аккаунтқа доступ әлі берілмеген' });

    const today = new Date().toISOString().slice(0, 10);
    const resetAt = acc[0].ai_calls_reset_at ? new Date(acc[0].ai_calls_reset_at).toISOString().slice(0, 10) : null;
    let callsToday = resetAt === today ? (acc[0].ai_calls_today || 0) : 0;

    if (callsToday >= DAILY_LIMIT) {
      return res.status(429).json({ error: `Бүгінге AI талдау лимиті (${DAILY_LIMIT}) бітті, ертең қайта көр` });
    }

    const summary = (req.body && req.body.summary) || {};
    const prompt = `Сен қаржылық көмекші AI-сың. Пайдаланушының осы айғы қаржы деректері (JSON):
${JSON.stringify(summary)}

Осы деректер негізінде ТЕК қазақ тілінде, қысқа әрі нақты жауап бер (250 сөзден аспасын):
1. Шығындарды қысқаша сараптап, ерекше көзге түсетін тұстарды атап өт.
2. Артық кеткен санаттар болса, нақты санмен көрсет.
3. Ақша үнемдеу бойынша 2-3 нақты ұсыныс бер.
4. Осы айдың қорытындысын бір сөйлеммен бер.
5. Келесі айға қысқаша болжам жаса.
Markdown белгілерсіз, қарапайым мәтінмен жаз.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      return res.status(502).json({ error: 'AI сервисі жауап бермеді, кейінірек қайта көр' });
    }
    const data = await r.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    if (!text) return res.status(502).json({ error: 'AI бос жауап қайтарды, қайта көр' });

    await sql`update users set ai_calls_today = ${callsToday + 1}, ai_calls_reset_at = ${today} where id = ${payload.uid}`;

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
