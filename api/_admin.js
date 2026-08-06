const { sql } = require('./_db');
const { verify } = require('./_auth');

// JWT-де сақталмайды — әр сұраныста DB-ден тексереді, сол үшін доступ қайтарып алынса дереу күшіне енеді
async function requireAdmin(req) {
  const payload = verify(req);
  if (!payload) return null;
  const rows = await sql`select is_admin from users where id = ${payload.uid}`;
  if (!rows[0] || !rows[0].is_admin) return null;
  return payload;
}

module.exports = { requireAdmin };
