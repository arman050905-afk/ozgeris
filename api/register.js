const bcrypt = require('bcryptjs');
const { sql } = require('./_db');
const { sendVerificationEmail } = require('./_email');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { name, email, pass } = req.body || {};
  if (!name || !email || !pass) return res.status(400).json({ error: 'Барлық өрісті толтыр' });

  const em = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(em)) return res.status(400).json({ error: 'Email дұрыс емес' });
  if (String(pass).length < 4) return res.status(400).json({ error: 'Пароль кемінде 4 таңба' });

  try {
    const existing = await sql`select id, email_verified from users where email = ${em}`;
    if (existing.length && existing[0].email_verified) {
      return res.status(409).json({ error: 'Бұл email тіркелген — кіріп көр' });
    }

    const hash = await bcrypt.hash(pass, 10);
    const code = genCode();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    if (existing.length) {
      // бұрын кодын растамай тастап кеткен жол — қайта тіркелуге мүмкіндік беру үшін жаңартамыз
      await sql`update users set name=${String(name).trim()}, pass_hash=${hash}, verify_code=${code}, verify_code_expires=${expires} where id=${existing[0].id}`;
    } else {
      const rows = await sql`
        insert into users (name, email, pass_hash, email_verified, verify_code, verify_code_expires)
        values (${String(name).trim()}, ${em}, ${hash}, false, ${code}, ${expires})
        returning id
      `;
      await sql`insert into user_data (user_id, data) values (${rows[0].id}, '{}'::jsonb)`;
    }

    await sendVerificationEmail(em, code);
    res.status(200).json({ needsVerification: true, email: em });
  } catch (e) {
    res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};
