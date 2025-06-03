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

    const since = parseInt(req.query.since) || 0;

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS atualizacoes (
                id SERIAL PRIMARY KEY,
                mensagem TEXT,
                timestamp BIGINT
            )
        `);

        const result = await pool.query(
            'SELECT * FROM atualizacoes WHERE timestamp > $1',
            [since]
        );

        if (result.rows.length > 0) {
            res.status(200).json({
                nova: true,
                atualizacoes: result.rows
            });
        } else {
            res.status(200).json({
                nova: false
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}
