const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL env var орнатылмаған (Vercel Project Settings → Environment Variables)');
}

const sql = neon(process.env.DATABASE_URL);

module.exports = { sql };
