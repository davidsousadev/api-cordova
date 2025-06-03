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
        await pool.query(`
            CREATE TABLE IF NOT EXISTS atualizacoes (
                id SERIAL PRIMARY KEY,
                mensagem TEXT,
                timestamp BIGINT
            )
        `);

        const result = await pool.query(
            'INSERT INTO atualizacoes (mensagem, timestamp) VALUES ($1, $2) RETURNING *',
            [mensagem, timestamp]
        );

        res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}
