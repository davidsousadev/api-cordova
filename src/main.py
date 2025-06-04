# src/main.py

import json
import time
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlmodel import SQLModel, Field, Session, select
from typing import List

from .database import get_engine, init_db

# ------------------------------
# 1) MODELO: tabela "atualizacoes"
# ------------------------------
class Atualizacao(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    mensagem: str
    timestamp: int


# ------------------------------
# 2) GERENCIADOR DE CONEXÕES WS
# ------------------------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        """Envia a mesma mensagem (texto) para todos os websockets conectados."""
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                # Se der erro ao enviar (cliente desconectou), remove da lista
                self.active_connections.remove(connection)


manager = ConnectionManager()

# ------------------------------
# 3) CRIAÇÃO DA APP E ROTAS
# ------------------------------
def create_app() -> FastAPI:
    # Inicializa o engine + cria tabelas
    engine = get_engine()
    init_db()

    app = FastAPI(
        title="API Buy Tech",
        description="API para gerenciar operações do sistema Buy Tech.",
        version="1.0.0",
    )

    # CORS (liberado para qualquer origem; em produção ajuste para domínios específicos)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # TrustedHost (sem restrição, em produção coloque uma lista restrita)
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*"],
    )

    # --------------------------
    # ENDPOINTS HTTP / RESTFUL
    # --------------------------

    @app.get("/")
    async def root():
        return {"message": "API Cordova com FastAPI + WebSocket + PostgreSQL ✔️"}

    @app.get("/trigger")
    async def trigger():
        """
        - Cria uma nova atualização na tabela (usando timestamp como ID e texto de mensagem).
        - Faz broadcast via WebSocket para todos clientes conectados.
        - Retorna o objeto criado.
        """
        agora_ms = int(time.time() * 1000)
        hora_legivel = time.strftime("%H:%M:%S", time.localtime())

        novo_item = Atualizacao(mensagem=f"Atualização em {hora_legivel}", timestamp=agora_ms)

        # Salva no banco
        with Session(engine) as session:
            session.add(novo_item)
            session.commit()
            session.refresh(novo_item)

        payload = {
            "nova": True,
            "atualizacoes": [
                {
                    "id": novo_item.id,
                    "mensagem": novo_item.mensagem,
                    "timestamp": novo_item.timestamp
                }
            ]
        }

        # Broadcast para todos os clientes conectados
        await manager.broadcast(json.dumps(payload))

        return {"success": True, "data": {"id": novo_item.id, "mensagem": novo_item.mensagem, "timestamp": novo_item.timestamp}}

    @app.get("/updates")
    async def updates(since: int | None = 0):
        """
        Endpoint de polling opcional: retorna todas as atualizações
        cujo timestamp seja maior que o 'since' fornecido.
        Exemplo: /updates?since=1717580000000
        """
        with Session(engine) as session:
            statement = select(Atualizacao).where(Atualizacao.timestamp > since).order_by(Atualizacao.timestamp)
            resultados = session.exec(statement).all()

        if resultados:
            return {
                "nova": True,
                "atualizacoes": [
                    {"id": item.id, "mensagem": item.mensagem, "timestamp": item.timestamp}
                    for item in resultados
                ]
            }
        else:
            return {"nova": False}

    # ---------------------------------------
    # ENDPOINT WEBSOCKET: /socket (broadcast)
    # ---------------------------------------
    @app.websocket("/socket")
    async def websocket_endpoint(websocket: WebSocket):
        """
        - Aceita conexão WebSocket e adiciona à lista de conexões ativas.
        - Fica em loop aguardando mensagens do cliente (mas não faz nada com elas).
        - Ao receber WebSocketDisconnect, remove da lista.
        - O broadcast acontece sempre que /trigger for chamado.
        """
        await manager.connect(websocket)
        try:
            while True:
                _ = await websocket.receive_text()
                # Nosso protocolo não processa mensagens do cliente; 
                # apenas mantém a conexão aberta para receber broadcast.
        except WebSocketDisconnect:
            manager.disconnect(websocket)
        except Exception:
            manager.disconnect(websocket)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    uvicorn.run("src.main:app", host="0.0.0.0", port=port, reload=True)