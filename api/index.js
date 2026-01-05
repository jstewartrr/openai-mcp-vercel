const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SNOWFLAKE_CONFIG = {
  account: 'dma22041.us-east-1',
  username: 'JOHN_CLAUDE',
  password: process.env.SNOWFLAKE_PASSWORD,
  database: 'SOVEREIGN_MIND',
  warehouse: 'COMPUTE_WH',
  role: 'ACCOUNTADMIN'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  return res.json({
    service: 'openai-mcp-vercel',
    status: 'healthy',
    hive_mind_connected: true,
    snowflake_account: SNOWFLAKE_CONFIG.account,
    tools: ['openai_chat', 'sm_hive_mind_read', 'sm_hive_mind_write']
  });
}
