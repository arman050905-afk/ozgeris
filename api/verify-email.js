const { sql } = require('./_db');
const { sign } = require('./_auth');
const { sendVerificationEmail } = require('./_email');

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = async (req, res) => {
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
