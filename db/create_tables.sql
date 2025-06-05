-- db/create_tables.sql

-- Tabela para armazenar tokens FCM dos dispositivos
CREATE TABLE IF NOT EXISTS fcm_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exemplo de tabela para armazenar notificações disparadas (opcional)
CREATE TABLE IF NOT EXISTS notifications_log (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);