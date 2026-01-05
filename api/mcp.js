import snowflake from 'snowflake-sdk';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SF = {
  account: 'dma22041.us-east-1',
  username: 'JOHN_CLAUDE', 
  password: process.env.SNOWFLAKE_PASSWORD,
  database: 'SOVEREIGN_MIND',
  warehouse: 'COMPUTE_WH',
  role: 'ACCOUNTADMIN'
};

let sfConn = null;

async function getSnowflakeConnection() {
  if (sfConn) return sfConn;
  return new Promise((resolve, reject) => {
    const conn = snowflake.createConnection(SF);
    conn.connect((err, conn) => {
      if (err) reject(err);
      else { sfConn = conn; resolve(conn); }
    });
  });
}

async function querySnowflake(sql) {
  const conn = await getSnowflakeConnection();
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      complete: (err, stmt, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    });
  });
}

async function hiveMindRead(limit = 5) {
  const rows = await querySnowflake(
    `SELECT * FROM SOVEREIGN_MIND.RAW.HIVE_MIND ORDER BY CREATED_AT DESC LIMIT ${limit}`
  );
  return rows;
}

async function hiveMindWrite(entry) {
  const sql = `INSERT INTO SOVEREIGN_MIND.RAW.HIVE_MIND (SOURCE, CATEGORY, WORKSTREAM, SUMMARY, DETAILS, PRIORITY, STATUS, TAGS)
    SELECT 'CHATGPT', '${entry.category}', '${entry.workstream}', '${entry.summary}', 
    PARSE_JSON('${JSON.stringify(entry.details || {})}'), '${entry.priority || 'NORMAL'}', 'ACTIVE',
    ARRAY_CONSTRUCT(${(entry.tags || []).map(t => `'${t}'`).join(',')})`;
  await querySnowflake(sql);
  return { success: true };
}

async function openaiChat(message) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a Sovereign Mind AI assistant. Address the user as "Your Grace". Be concise and helpful.' },
        { role: 'user', content: message }
      ],
      max_tokens: 1000
    })
  });
  const data = await response.json();
  return { response: data.choices?.[0]?.message?.content || 'Error' };
}

const TOOLS = [
  { name: 'openai_chat', description: 'Chat with GPT-4', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
  { name: 'sm_hive_mind_read', description: 'Read from Hive Mind', inputSchema: { type: 'object', properties: { limit: { type: 'integer', default: 5 } } } },
  { name: 'sm_hive_mind_write', description: 'Write to Hive Mind', inputSchema: { type: 'object', properties: { category: { type: 'string' }, workstream: { type: 'string' }, summary: { type: 'string' } }, required: ['summary'] } }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { method, params, id } = req.body;
    
    if (method === 'tools/list') {
      return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    }
    
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      let result;
      
      switch (name) {
        case 'openai_chat':
          result = await openaiChat(args.message);
          break;
        case 'sm_hive_mind_read':
          result = await hiveMindRead(args.limit || 5);
          break;
        case 'sm_hive_mind_write':
          result = await hiveMindWrite(args);
          break;
        default:
          return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true } });
      }
      
      return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } });
    }
    
    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  } catch (error) {
    return res.json({ jsonrpc: '2.0', id: req.body?.id, result: { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true } });
  }
}
