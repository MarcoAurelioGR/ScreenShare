import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { customAlphabet, nanoid } from 'nanoid';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';

type Role = 'HOST' | 'PARTICIPANT';
type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'KICKED';

type Participant = {
  id: string;
  name: string;
  role: Role;
  status: Status;
  isSharing: boolean;
  socket?: WebSocket;
};

type RoomState = {
  id: string;
  hostId: string;
  participants: Map<string, Participant>;
  createdAt: number;
};

const app = Fastify({ logger: true });
const rooms = new Map<string, RoomState>();
const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'ws://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'secret';
const roomService = new RoomServiceClient(
  LIVEKIT_URL.replace(/^ws/, 'http'),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

await app.register(cors, {
  origin: '*'
});

function publicParticipant(p: Participant) {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    status: p.status,
    isSharing: p.isSharing
  };
}

function publicRoom(room: RoomState) {
  return {
    id: room.id,
    hostId: room.hostId,
    participants: [...room.participants.values()].map(publicParticipant)
  };
}

function broadcast(room: RoomState, payload: unknown) {
  const data = JSON.stringify(payload);
  for (const p of room.participants.values()) {
    if (p.socket?.readyState === WebSocket.OPEN) p.socket.send(data);
  }
}

function getRoom(id: string) {
  return rooms.get(id.toUpperCase());
}

app.get('/health', async () => ({ ok: true }));

app.post('/api/rooms', async (req, reply) => {
  const body = req.body as { name?: string };
  const name = String(body?.name ?? '').trim().slice(0, 40);
  if (!name) return reply.code(400).send({ error: 'Nome obrigatório' });

  let id = makeCode();
  while (rooms.has(id)) id = makeCode();

  const hostId = nanoid(16);
  const host: Participant = {
    id: hostId, name, role: 'HOST', status: 'APPROVED', isSharing: false
  };

  rooms.set(id, {
    id,
    hostId,
    participants: new Map([[hostId, host]]),
    createdAt: Date.now()
  });

  return { roomId: id, participantId: hostId, role: 'HOST' };
});

app.get('/api/rooms/:roomId', async (req, reply) => {
  const { roomId } = req.params as { roomId: string };
  const room = getRoom(roomId);
  if (!room) return reply.code(404).send({ error: 'Sala inexistente' });
  return publicRoom(room);
});

app.post('/api/rooms/:roomId/join', async (req, reply) => {
  const { roomId } = req.params as { roomId: string };
  const body = req.body as { name?: string };
  const room = getRoom(roomId);
  const name = String(body?.name ?? '').trim().slice(0, 40);

  if (!room) return reply.code(404).send({ error: 'Sala inexistente' });
  if (!name) return reply.code(400).send({ error: 'Nome obrigatório' });

  const participantId = nanoid(16);
  const participant: Participant = {
    id: participantId, name, role: 'PARTICIPANT', status: 'PENDING', isSharing: false
  };
  room.participants.set(participantId, participant);

  broadcast(room, { type: 'join-request', participant: publicParticipant(participant) });
  broadcast(room, { type: 'room-state', room: publicRoom(room) });

  return { roomId, participantId, status: 'PENDING' };
});

app.post('/api/rooms/:roomId/token', async (req, reply) => {
  const { roomId } = req.params as { roomId: string };
  const body = req.body as { participantId?: string };
  const room = getRoom(roomId);
  const participant = room?.participants.get(body?.participantId ?? '');

  if (!room || !participant) return reply.code(404).send({ error: 'Participante não encontrado' });
  if (participant.status !== 'APPROVED') return reply.code(403).send({ error: 'Acesso ainda não aprovado' });

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participant.id,
    name: participant.name,
    ttl: '2h'
  });

  token.addGrant({
    roomJoin: true,
    room: room.id,
    canSubscribe: true,
    canPublish: true,
    canPublishData: true
  });

  return { token: await token.toJwt(), url: LIVEKIT_URL };
});

app.post('/api/rooms/:roomId/moderate', async (req, reply) => {
  const { roomId } = req.params as { roomId: string };
  const body = req.body as {
    hostId?: string;
    participantId?: string;
    action?: 'approve' | 'reject' | 'kick' | 'stop-share' | 'close-room';
  };

  const room = getRoom(roomId);
  if (!room || room.hostId !== body.hostId) return reply.code(403).send({ error: 'Sem permissão' });

  const target = body.participantId ? room.participants.get(body.participantId) : undefined;

  if (body.action === 'approve' && target) {
    target.status = 'APPROVED';
    broadcast(room, { type: 'approved', participant: publicParticipant(target) });
  } else if (body.action === 'reject' && target) {
    target.status = 'REJECTED';
    broadcast(room, { type: 'rejected', participantId: target.id });
  } else if (body.action === 'kick' && target && target.id !== room.hostId) {
    target.status = 'KICKED';
    target.socket?.send(JSON.stringify({ type: 'kicked' }));
    target.socket?.close();
    room.participants.delete(target.id);
    try { await roomService.removeParticipant(room.id, target.id); } catch {}
    broadcast(room, { type: 'room-state', room: publicRoom(room) });
  } else if (body.action === 'stop-share' && target) {
    target.isSharing = false;
    try { await roomService.mutePublishedTrack(room.id, target.id, '', true); } catch {}
    broadcast(room, { type: 'stop-share', participantId: target.id });
  } else if (body.action === 'close-room') {
    broadcast(room, { type: 'room-closed' });
    for (const p of room.participants.values()) p.socket?.close();
    try { await roomService.deleteRoom(room.id); } catch {}
    rooms.delete(room.id);
  }

  broadcast(room, { type: 'room-state', room: publicRoom(room) });
  return { ok: true };
});

const wss = new WebSocketServer({ server: app.server, path: '/ws' });

wss.on('connection', (socket, request) => {
  const url = new URL(request.url ?? '', 'http://localhost');
  const roomId = url.searchParams.get('roomId')?.toUpperCase();
  const participantId = url.searchParams.get('participantId') ?? '';
  const room = roomId ? getRoom(roomId) : undefined;
  const participant = room?.participants.get(participantId);

  if (!room || !participant) {
    socket.close(1008, 'Invalid session');
    return;
  }

  participant.socket = socket;
  socket.send(JSON.stringify({ type: 'room-state', room: publicRoom(room) }));

  socket.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'sharing-state' && typeof msg.isSharing === 'boolean') {
        participant.isSharing = msg.isSharing;
        broadcast(room, { type: 'sharing-state', participantId, isSharing: participant.isSharing });
      }
    } catch {}
  });

  socket.on('close', () => {
    if (participant.socket === socket) participant.socket = undefined;
  });
});

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' }, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
