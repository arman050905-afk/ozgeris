// УАҚЫТША диагностика endpoint-і — env var-лардың бар/жоғын тексеру үшін (мән өзі
// қайтарылмайды, тек true/false). Мәселе шешілгеннен кейін бұл файлды өшіру керек.
module.exports = async (req, res) => {
  res.status(200).json({
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    anthropicKeyPrefix: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.slice(0, 12) : null,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasCronSecret: !!process.env.CRON_SECRET,
    hasVapidPublic: !!process.env.VAPID_PUBLIC_KEY,
    hasVapidPrivate: !!process.env.VAPID_PRIVATE_KEY,
    testHello: process.env.TEST_HELLO || null,
    hasMyClaudeKey: !!process.env.MY_CLAUDE_KEY,
    myClaudeKeyPrefix: process.env.MY_CLAUDE_KEY ? process.env.MY_CLAUDE_KEY.slice(0, 12) : null,
    allEnvKeys: Object.keys(process.env).filter(k => /ANTHROPIC|CLAUDE|VAPID|CRON|TEST_HELLO/i.test(k)),
    vercelEnv: process.env.VERCEL_ENV || null,
    vercelGitBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
    vercelGitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
  });
};
