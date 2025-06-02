require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const porta = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuração do banco PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Importante para conexões com Aiven ou Heroku
});

// Criação da tabela, se não existir
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
        console.log('Tabela atualizacoes pronta.');
    }
});

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
    } catch (err) {
        console.error('Erro no trigger:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 🔍 Endpoint para buscar atualizações desde um timestamp
app.get('/updates', async (req, res) => {
    const since = parseInt(req.query.since) || 0;

    try {
        const result = await pool.query(
            'SELECT * FROM atualizacoes WHERE timestamp > $1 ORDER BY timestamp ASC',
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
    } catch (err) {
        console.error('Erro no updates:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(porta, () => {
    console.log(`API rodando em http://localhost:${porta}`);
});
