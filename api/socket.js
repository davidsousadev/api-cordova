import { Pool, Client } from 'pg';
import { WebSocketServer } from 'ws';

let wss;         // instância do WebSocketServer
let pgClient;    // cliente PostgreSQL para LISTEN/NOTIFY

export default async function handler(req, res) {
  // **IMPORTANTE**: precisamos “upgrade” a conexão HTTP para WebSocket apenas uma vez.
  if (!res.socket.server.wss) {
    // 1) Cria o WebSocketServer "singleton"
    wss = new WebSocketServer({ noServer: true });

    // 2) Anexa ao socket do Vercel
    res.socket.server.on('upgrade', (request, socket, head) => {
      if (request.url === '/socket') {
        wss.handleUpgrade(request, socket, head, ws => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    // 3) Conecta no PostgreSQL usando um cliente separado para LISTEN/NOTIFY
    pgClient = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    pgClient.connect()
      .then(() => {
        // Passo de segurança: garante que a tabela existe (mesma DDL que usamos em trigger/updates)
        return pgClient.query(`
          CREATE TABLE IF NOT EXISTS atualizacoes (
            id SERIAL PRIMARY KEY,
            mensagem TEXT,
            timestamp BIGINT
          )
        `);
      })
      .then(() => {
        // Começa a “ouvir” notificações no canal 'atualizacoes'
        return pgClient.query('LISTEN atualizacoes');
      })
      .catch(err => {
        console.error('Falha ao conectar/listen no PostgreSQL:', err);
      });

    // 4) Quando o PostgreSQL emitir NOTIFY, broadcast para todos clientes WebSocket
    pgClient.on('notification', msg => {
      if (msg.channel === 'atualizacoes') {
        let payload;
        try {
          payload = JSON.parse(msg.payload);
        } catch (e) {
          console.error('Payload inválido no NOTIFY:', e, msg.payload);
          return;
        }

        // Monta a mensagem exatamente no mesmo formato que o front‐end espera:
        // { nova: true, atualizacoes: [ { id, mensagem, timestamp } ] }
        const messageToClients = JSON.stringify({
          nova: true,
          atualizacoes: [payload]
        });

        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(messageToClients);
          }
        });
      }
    });

    // 5) Trata novas conexões WebSocket
    wss.on('connection', socket => {
      console.log('Cliente WebSocket conectado.');

      // Opcional: assim que alguém conectar, podemos enviar um "ack" ou até
      // enviar todas as atualizações pendentes. Mas, para simplificar, basta
      // manter conexão aberta e só enviar quando o NOTIFY chegar.

      socket.on('close', () => {
        console.log('Cliente WebSocket desconectou.');
      });
    });

    // 6) Marca no servidor Vercel que já inicializamos o WSS
    res.socket.server.wss = true;
    console.log('WebSocketServer inicializado.');
  }

  // Nunca entramos neste handler via GET/POST normal: 
  // o endpoint existe apenas para “capturar” o upgrade da requisição.
  res.status(200).end();
}