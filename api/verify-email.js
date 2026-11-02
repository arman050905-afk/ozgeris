const { sql } = require('./_db');
const { sign } = require('./_auth');
const { sendVerificationEmail } = require('./_email');
const { checkUnsubToken, ensureBillingSchema } = require('./_billing');

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Сату хаттарының астындағы «Хаттардан бас тарту» сілтемесі — GET ?unsub=<uid>.<hmac>
async function unsubscribe(req, res) {
  const uid = checkUnsubToken(req.query.unsub);
  let ok = false;
  if (uid) {
    try {
      await ensureBillingSchema();
      await sql`update users set mail_optout = true where id::text = ${uid}`;
      ok = true;
    } catch (e) { console.error('unsub failed:', e); }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(ok ? 200 : 400).send(`<!doctype html><html lang="kk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ÖZGERIS</title></head>
<body style="margin:0;background:#0a0a14;color:#eceaf5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box">
<div style="max-width:420px;text-align:center"><div style="font-weight:900;font-size:22px;color:#a48bff;margin-bottom:14px">ÖZGERIS</div>
<p style="font-size:16px;line-height:1.6">${ok ? 'Болды, енді саған хат жібермейміз.' : 'Сілтеме жарамсыз.'}</p>
<a href="/" style="color:#a48bff">ozgeris.asia</a></div></body></html>`);
}

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query && req.query.unsub) return unsubscribe(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { action, email, code } = req.body || {};
  const em = String(email || '').trim().toLowerCase();
  if (!em) return res.status(400).json({ error: 'Email жоқ' });

  try {
    if (action === 'resend') {
      const rows = await sql`select id, email_verified, verify_code_expires from users where email=${em}`;
      const u = rows[0];
      if (!u) return res.status(404).json({ error: 'Аккаунт табылмады' });
      if (u.email_verified) return res.status(400).json({ error: 'Email расталған, кіріп көр' });
      if (u.verify_code_expires) {
        const sentAt = new Date(u.verify_code_expires).getTime() - 15 * 60 * 1000;
        if (Date.now() - sentAt < 30 * 1000) return res.status(429).json({ error: 'Сәл күте тұр, кодты жаңа ғана жібердік' });
      }
      const code2 = genCode();
      const expires = new Date(Date.now() + 15 * 60 * 1000);
      await sql`update users set verify_code=${code2}, verify_code_expires=${expires} where id=${u.id}`;
      await sendVerificationEmail(em, code2);
      return res.status(200).json({ ok: true });
    }

    // action === 'verify'
    const rows = await sql`select id, name, email, email_verified, verify_code, verify_code_expires from users where email=${em}`;
    const u = rows[0];
    if (!u) return res.status(404).json({ error: 'Аккаунт табылмады' });
    if (u.email_verified) return res.status(400).json({ error: 'Email расталған, кіріп көр' });
    if (!code || u.verify_code !== String(code).trim()) return res.status(400).json({ error: 'Код қате' });
    if (!u.verify_code_expires || new Date(u.verify_code_expires) < new Date()) {
      return res.status(400).json({ error: 'Кодтың мерзімі өтті, жаңасын сұра' });
    }

    await sql`update users set email_verified=true, verify_code=null, verify_code_expires=null where id=${u.id}`;
    const token = sign(u);
    res.status(200).json({ token, user: { name: u.name, email: u.email } });
  } catch (e) {
    res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
