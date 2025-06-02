import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Cria tabela (executa toda vez, mas é idempotente)
await pool.query(`
    CREATE TABLE IF NOT EXISTS atualizacoes (
        id SERIAL PRIMARY KEY,
        mensagem TEXT,
        timestamp BIGINT
    )
`);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const timestamp = Date.now();
    const mensagem = 'Atualização em ' + new Date(timestamp).toLocaleTimeString();

    try {
        const result = await pool.query(
            'INSERT INTO atualizacoes (mensagem, timestamp) VALUES ($1, $2) RETURNING *',
            [mensagem, timestamp]
        );
        res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}
