require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const { Pool } = require('pg');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const port = process.env.PORT || 3000;

// 🔥 Firebase Config
let serviceAccount;
if (process.env.FIREBASE_CONFIG) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
    console.log('✅ Firebase carregado da variável de ambiente');
  } catch (error) {
    console.error('❌ Erro no FIREBASE_CONFIG:', error);
    process.exit(1);
  }
} else if (fs.existsSync('./api/serviceAccountKey.json')) {
  serviceAccount = require('./serviceAccountKey.json');
  console.log('✅ Firebase carregado do arquivo local');
} else {
  throw new Error('❌ Firebase não configurado!');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// 🔗 PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

// 🔥 Rotas
app.get('/', (req, res) => {
  res.json({ message: '🚀 API funcionando!' });
});

app.get('/tokens', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT token FROM fcm_tokens');
    const tokens = rows.map(r => r.token);
    res.json({ tokens });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/register-token', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token é obrigatório' });

  try {
    const query = `
      INSERT INTO fcm_tokens (token)
      VALUES ($1)
      ON CONFLICT (token) DO NOTHING
      RETURNING id, token, created_at;
    `;
    const { rows, rowCount } = await pool.query(query, [token]);

    if (rowCount === 0) {
      return res.status(200).json({ message: 'Token já cadastrado.' });
    }

    return res.status(201).json({
      message: 'Token registrado com sucesso.',
      token: rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/send-notification', async (req, res) => {
  const { title, body: messageBody, data, tokens } = req.body;

  if (!title || !messageBody) {
    return res.status(400).json({ error: 'title e body são obrigatórios.' });
  }

  try {
    let targetTokens = tokens;

    if (!Array.isArray(targetTokens) || targetTokens.length === 0) {
      const { rows } = await pool.query('SELECT token FROM fcm_tokens');
      targetTokens = rows.map((row) => row.token);
    }

    if (targetTokens.length === 0) {
      return res.status(200).json({ message: 'Nenhum token cadastrado.' });
    }

    const payload = {
      notification: { title, body: messageBody },
      data: data || {},
    };

    const response = await admin.messaging().sendMulticast({
      tokens: targetTokens,
      ...payload,
    });

    await pool.query(
      'INSERT INTO notifications_log (title, body, data) VALUES ($1, $2, $3)',
      [title, messageBody, JSON.stringify(data) || '{}']
    );

    res.status(200).json({
      message: 'Notificação enviada.',
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// 🔥 Inicialização local
if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  });
}

module.exports = app;