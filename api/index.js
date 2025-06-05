require('dotenv').config();
const admin = require('firebase-admin');
const { Pool } = require('pg');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 Firebase Config
const firebaseConfig = process.env.FIREBASE_CONFIG;
if (!firebaseConfig) {
  throw new Error('❌ Variável FIREBASE_CONFIG não configurada.');
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(firebaseConfig);
} catch (error) {
  throw new Error('❌ Erro ao parsear FIREBASE_CONFIG: ' + error.message);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// 🔗 PostgreSQL Config
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

// 🚀 Rotas
app.get('/', (_req, res) => {
  res.json({ message: '🚀 API de Notificações FCM está ativa!' });
});

// 🔍 Buscar Tokens
app.get('/tokens', async (_req, res) => {
  try {
    const result = await pool.query('SELECT token FROM fcm_tokens');
    const tokens = result.rows.map((row) => row.token);
    res.json({ tokens });
  } catch (error) {
    console.error('Erro ao buscar tokens:', error);
    res.status(500).json({ error: 'Erro interno ao buscar tokens.' });
  }
});

// 📝 Registrar Token
app.post('/register-token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token FCM é obrigatório.' });
  }

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

    res.status(201).json({
      message: 'Token registrado com sucesso.',
      token: rows[0],
    });
  } catch (error) {
    console.error('Erro ao registrar token:', error);
    res.status(500).json({ error: 'Erro interno ao registrar token.' });
  }
});

// 🚀 Enviar Notificação
app.post('/send-notification', async (req, res) => {
  const { title, body: messageBody, data = {}, tokens } = req.body;

  if (!title || !messageBody) {
    return res
      .status(400)
      .json({ error: 'Os campos title e body são obrigatórios.' });
  }

  try {
    let targetTokens = tokens;

    if (!Array.isArray(targetTokens) || targetTokens.length === 0) {
      const result = await pool.query('SELECT token FROM fcm_tokens');
      targetTokens = result.rows.map((row) => row.token);
    }

    if (targetTokens.length === 0) {
      return res.status(200).json({ message: 'Nenhum token cadastrado.' });
    }

    const payload = {
      notification: { title, body: messageBody },
      data,
    };

    const response = await admin.messaging().sendMulticast({
      tokens: targetTokens,
      ...payload,
    });

    // Log da notificação no banco
    await pool.query(
      'INSERT INTO notifications_log (title, body, data) VALUES ($1, $2, $3)',
      [title, messageBody, JSON.stringify(data)]
    );

    res.status(200).json({
      message: 'Notificação enviada.',
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    });
  } catch (error) {
    console.error('Erro ao enviar notificação:', error);
    res.status(500).json({ error: 'Erro interno ao enviar notificação.' });
  }
});

// 🔗 Exportação Serverless
module.exports = app;
module.exports.handler = (req, res) => app(req, res);