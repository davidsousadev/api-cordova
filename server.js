require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const porta = 3000;

// PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Testa conexão e cria tabela se não existir
pool.query(`
    CREATE TABLE IF NOT EXISTS atualizacoes (
        id SERIAL PRIMARY KEY,
        mensagem TEXT,
        timestamp BIGINT
    )
`, (err) => {
    if (err) {
        console.error('Erro ao criar tabela:', err);
    } else {
        console.log('Tabela verificada/criada com sucesso.');
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// 🔥 Endpoint para gerar uma atualização manual
app.get('/trigger', async (req, res) => {
    const timestamp = Date.now();
    const mensagem = 'Atualização em ' + new Date(timestamp).toLocaleTimeString();

    try {
        const result = await pool.query(
            'INSERT INTO atualizacoes (mensagem, timestamp) VALUES ($1, $2) RETURNING *',
            [mensagem, timestamp]
        );
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔍 Endpoint para buscar atualizações desde um timestamp
app.get('/updates', async (req, res) => {
    const since = parseInt(req.query.since) || 0;

    try {
        const result = await pool.query(
            'SELECT * FROM atualizacoes WHERE timestamp > $1',
            [since]
        );

        if (result.rows.length > 0) {
            res.json({
                nova: true,
                atualizacoes: result.rows
            });
        } else {
            res.json({
                nova: false
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(porta, () => {
    console.log(`API rodando em http://localhost:${porta}`);
});
