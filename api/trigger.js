import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const timestamp = Date.now();
  const mensagem = 'Atualização em ' + new Date(timestamp).toLocaleTimeString();

  try {
    // 1) Garante tabela
    await pool.query(`
      CREATE TABLE IF NOT EXISTS atualizacoes (
        id SERIAL PRIMARY KEY,
        mensagem TEXT,
        timestamp BIGINT
      )
    `);

    // 2) Insere no banco
    const insertResult = await pool.query(
      'INSERT INTO atualizacoes (mensagem, timestamp) VALUES ($1, $2) RETURNING *',
      [mensagem, timestamp]
    );

    const newRow = insertResult.rows[0];

    // 3) Emite um NOTIFY para o canal 'atualizacoes', com payload sendo o objeto JSON
    const payload = JSON.stringify({
      id: newRow.id,
      mensagem: newRow.mensagem,
      timestamp: newRow.timestamp
    });

    await pool.query(`NOTIFY atualizacoes, $1`, [payload]);

    // 4) Responde ao client HTTP
    return res.status(200).json({ success: true, data: newRow });
  } catch (error) {
    console.error('Erro no /trigger:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}