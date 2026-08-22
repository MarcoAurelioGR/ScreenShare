# Screen Share — React + Node.js + LiveKit

Aplicativo de compartilhamento de tela em tempo real baseado em WebRTC + LiveKit SFU.

## O que está implementado

- Criação de sala com código aleatório.
- Entrada por código + nome.
- Aprovação/recusa pelo anfitrião.
- Controle de permissões no backend.
- Compartilhamento de tela por qualquer participante aprovado.
- Múltiplas telas simultâneas.
- Encerramento da transmissão de outro participante pelo anfitrião.
- Expulsão de participante.
- Encerramento da sala.
- WebSocket para eventos de sala.
- LiveKit como SFU.
- Reconexão da camada de sinalização.
- Interface responsiva.
- Docker Compose para LiveKit + Redis.
- `.env.example`.

## Requisitos

- Node.js 20+
- npm
- Docker Desktop

## Desenvolvimento

1. Copie os arquivos `.env.example` para `.env` em `backend` e `frontend`.
2. Execute:

```bash
docker compose up -d
```

3. Backend:

```bash
cd backend
npm install
npm run dev
```

4. Frontend:

```bash
cd frontend
npm install
npm run dev
```

Abra `http://localhost:5173`.

## LiveKit

O `docker-compose.yml` usa LiveKit em modo local com as credenciais de desenvolvimento `devkey/secret`, adequadas somente para desenvolvimento.

Para produção, substitua por uma implantação própria do LiveKit com HTTPS/WSS, TURN e firewall configurados.

## Observação importante

A distribuição de mídia é SFU-first. O projeto não força usuários comuns a atuar como relay P2P, porque isso pode degradar a conexão e a previsibilidade do sistema. A camada de mídia foi isolada para que uma política de relay opcional possa ser adicionada posteriormente sem alterar o fluxo da sala.
