import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Room, RoomEvent, Track, RemoteTrackPublication, RemoteParticipant,
  LocalParticipant, VideoPresets
} from 'livekit-client';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type P = { id: string; name: string; role: 'HOST'|'PARTICIPANT'; status: string; isSharing: boolean };
type RoomState = { id: string; hostId: string; participants: P[] };

function api(path: string, init?: RequestInit) {
  return fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? 'Erro');
    return data;
  });
}

export function App() {
  const [page, setPage] = useState<'home'|'name'|'waiting'|'room'>('home');
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'HOST'|'PARTICIPANT'>('PARTICIPANT');
  const [participantId, setParticipantId] = useState('');
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<'create'|'join'|null>(null);

  async function createRoom() {
    setError('');
    const n = prompt('Nome do anfitrião:')?.trim();
    if (!n) return;
    try {
      const data = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ name: n }) });
      setRoomCode(data.roomId); setParticipantId(data.participantId); setRole('HOST'); setName(n);
      setPage('room');
    } catch (e) { setError((e as Error).message); }
  }

  function startJoin() {
    if (!roomCode.trim()) return setError('Informe o código da sala.');
    setError(''); setPendingAction('join'); setPage('name');
  }

  async function join() {
    try {
      const data = await api(`/api/rooms/${roomCode.trim().toUpperCase()}/join`, {
        method: 'POST', body: JSON.stringify({ name })
      });
      setParticipantId(data.participantId);
      setRole('PARTICIPANT');
      setRoomCode(roomCode.trim().toUpperCase());
      setPage('waiting');
    } catch (e) { setError((e as Error).message); }
  }

  if (page === 'home') return <Home code={roomCode} setCode={setRoomCode} onJoin={startJoin} onCreate={createRoom} error={error} />;
  if (page === 'name') return <NamePage name={name} setName={setName} onBack={() => setPage('home')} onContinue={join} error={error} />;
  if (page === 'waiting') return <Waiting roomCode={roomCode} participantId={participantId} onApproved={() => setPage('room')} onBack={() => setPage('home')} />;
  return <RoomPage roomCode={roomCode} participantId={participantId} role={role} initial={roomState} onLeave={() => { setPage('home'); location.reload(); }} />;
}

function Home({code,setCode,onJoin,onCreate,error}:{code:string,setCode:(s:string)=>void,onJoin:()=>void,onCreate:()=>void,error:string}) {
  return <main className="center"><section className="card hero">
    <div className="logo">SCREEN<span>SHARE</span></div>
    <p className="muted">Compartilhamento de tela em tempo real</p>
    <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="Código da sala" maxLength={8} />
    <button className="primary" onClick={onJoin}>Entrar na sala</button>
    <button className="secondary" onClick={onCreate}>Criar sala</button>
    {error && <div className="error">{error}</div>}
  </section></main>
}

function NamePage({name,setName,onBack,onContinue,error}:{name:string,setName:(s:string)=>void,onBack:()=>void,onContinue:()=>void,error:string}) {
  return <main className="center"><section className="card">
    <h1>Seu nome</h1><p className="muted">O anfitrião verá este nome antes de aprovar sua entrada.</p>
    <input autoFocus value={name} onChange={e=>setName(e.target.value.slice(0,40))} placeholder="Digite seu nome" />
    <button className="primary" disabled={!name.trim()} onClick={onContinue}>Solicitar entrada</button>
    <button className="link" onClick={onBack}>Voltar</button>
    {error && <div className="error">{error}</div>}
  </section></main>
}

function Waiting({roomCode,participantId,onApproved,onBack}:{roomCode:string,participantId:string,onApproved:()=>void,onBack:()=>void}) {
  useEffect(()=>{
    const ws = new WebSocket(`${API.replace(/^http/,'ws')}/ws?roomId=${roomCode}&participantId=${participantId}`);
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.type === 'approved') onApproved();
      if (m.type === 'rejected' || m.type === 'kicked' || m.type === 'room-closed') onBack();
    };
    return ()=>ws.close();
  },[roomCode,participantId,onApproved,onBack]);
  return <main className="center"><section className="card waiting">
    <div className="spinner" /><h1>Aguardando aprovação</h1>
    <p className="muted">O anfitrião precisa aceitar sua entrada na sala.</p>
    <div className="room-code">{roomCode}</div>
    <button className="link" onClick={onBack}>Cancelar</button>
  </section></main>
}

function RoomPage({roomCode,participantId,role,onLeave}:{roomCode:string,participantId:string,role:'HOST'|'PARTICIPANT',initial:RoomState|null,onLeave:()=>void}) {
  const roomRef = useRef<Room|null>(null);
  const wsRef = useRef<WebSocket|null>(null);
  const [state,setState] = useState<RoomState|null>(null);
  const [connected,setConnected] = useState(false);
  const [tracks,setTracks] = useState<Map<string,HTMLVideoElement>>(new Map());
  const [sharing,setSharing] = useState(false);

  // Gerenciamento da conexão WebSocket
  useEffect(()=>{
    const ws = new WebSocket(`${API.replace(/^http/,'ws')}/ws?roomId=${roomCode}&participantId=${participantId}`);
    wsRef.current = ws;

    ws.onmessage = e => {
      const m=JSON.parse(e.data);
      if(m.type==='room-state') setState(m.room);
      if(m.type==='sharing-state') setState(s=>s?({...s,participants:s.participants.map(p=>p.id===m.participantId?{...p,isSharing:m.isSharing}:p)}):s);
      if(m.type==='stop-share') setState(s=>s?({...s,participants:s.participants.map(p=>p.id===m.participantId?{...p,isSharing:false}:p)}):s);
      if(m.type==='kicked'||m.type==='room-closed') onLeave();
    };

    return ()=>{
      ws.close();
      wsRef.current = null;
    };
  },[roomCode,participantId,onLeave]);

  // Conexão com o LiveKit para o fluxo de Vídeo
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try {
        const t=await api(`/api/rooms/${roomCode}/token`,{method:'POST',body:JSON.stringify({participantId})});
        const r=new Room({adaptiveStream:true,dynacast:true,videoCaptureDefaults:{resolution:VideoPresets.h1080.resolution}});
        roomRef.current=r;

        // 1. Escuta telas e áudios de PARTICIPANTES REMOTOS
        r.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          const el = track.attach();
          el.autoplay = true;

          if (track.kind === Track.Kind.Video) {
            el.playsInline = true;
            el.className = 'screen-video';
            const key = `${participant.identity}:${publication.trackSid}`;
            setTracks(prev => new Map(prev).set(key, el as HTMLVideoElement));
          } else if (track.kind === Track.Kind.Audio) {
            el.style.display = 'none'; // Oculta o reprodutor visual do áudio
            document.body.appendChild(el); // Adiciona ao fundo para tocar
          }
        });

        r.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          track.detach().forEach(x => x.remove()); // Remove da tela/fundo
          if (track.kind === Track.Kind.Video) {
            const key = `${participant.identity}:${publication.trackSid}`;
            setTracks(prev => { const n = new Map(prev); n.delete(key); return n; });
          }
        });

        // 2. Escuta SUA PRÓPRIA TELA (Participante Local)
        r.on(RoomEvent.LocalTrackPublished, (pub) => {
          if (pub.kind !== Track.Kind.Video) return;
          const el = pub.track?.attach() as HTMLVideoElement;
          if (el) {
            el.autoplay = true; el.playsInline = true; el.className = 'screen-video';
            const key = `${r.localParticipant.identity}:${pub.trackSid}`;
            setTracks(prev => new Map(prev).set(key, el));
          }
        });

        r.on(RoomEvent.LocalTrackUnpublished, (pub) => {
          const key = `${r.localParticipant.identity}:${pub.trackSid}`;
          setTracks(prev => { const n = new Map(prev); n.delete(key); return n; });
        });

        // 3. Gerenciamento de Status de Conexão do LiveKit
        r.on(RoomEvent.Reconnecting, () => setConnected(false));
        r.on(RoomEvent.Reconnected, () => setConnected(true));
        r.on(RoomEvent.Disconnected, () => setConnected(false));

	r.on(RoomEvent.Disconnected, (reason) => console.log('Desconectou motivo:', reason));

        await r.connect(t.url,t.token);
        if(!cancelled) setConnected(true);
      } catch(e){ console.error('Erro na conexão LiveKit:', e); }
    })();

    return ()=>{
      cancelled=true;
      roomRef.current?.disconnect();
    };
  },[roomCode,participantId]);

  async function toggleShare() {
    const r = roomRef.current; if (!r) return;
    const next = !sharing;
    
    try {
      await r.localParticipant.setScreenShareEnabled(next, { audio: true });
      setSharing(next);

      // Notifica o backend via WebSocket sobre o novo estado de compartilhamento
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'sharing-state', isSharing: next }));
      }
    } catch (e) {
      console.error('Erro ao alternar compartilhamento:', e);
    }
  }

  async function moderate(targetId:string,action:'approve'|'reject'|'kick'|'stop-share'|'close-room') {
    await api(`/api/rooms/${roomCode}/moderate`,{method:'POST',body:JSON.stringify({hostId:participantId,participantId:targetId,action})});
  }

  const activeTracks=useMemo(()=>[...tracks.entries()],[tracks]);

  return <main className="room-page">
    <header className="topbar"><div><strong>SCREENSHARE</strong><span className="room-pill">Sala {roomCode}</span></div>
      <div className="top-actions"><button className="secondary small" onClick={()=>navigator.clipboard.writeText(roomCode)}>Copiar código</button>
      <span className={connected?'status online':'status'}>{connected?'Conectado':'Reconectando'}</span>
      <button className="danger small" onClick={onLeave}>Sair</button></div>
    </header>
    <div className="layout">
      <aside className="sidebar"><h3>Participantes</h3>
        {state?.participants.map(p=><div className="participant" key={p.id}>
          <span className="dot" /> <span className="pname">{p.name}</span>{p.role==='HOST'&&<span>👑</span>}
          {p.isSharing&&<span className="share-tag">TELA</span>}
          {role==='HOST'&&p.id!==participantId&&p.status==='PENDING'&&<div className="request-actions"><button onClick={()=>moderate(p.id,'approve')}>Aceitar</button><button onClick={()=>moderate(p.id,'reject')}>Recusar</button></div>}
          {role==='HOST'&&p.id!==participantId&&p.status==='APPROVED'&&<div className="moderation"><button onClick={()=>moderate(p.id,'stop-share')}>Encerrar tela</button><button onClick={()=>moderate(p.id,'kick')}>Expulsar</button></div>}
        </div>)}
        {role==='HOST'&&<button className="danger full" onClick={()=>moderate(participantId,'close-room')}>Encerrar sala</button>}
      </aside>
      <section className="content">
        <div className="screen-grid">{activeTracks.length===0?<div className="empty"><div className="empty-icon">▣</div><h2>Nenhuma transmissão ativa</h2><p>Compartilhe sua tela para começar.</p></div>:
          activeTracks.map(([key,el])=><div className="screen-card" key={key}><div ref={n=>{if(n&&el.parentElement!==n)n.appendChild(el)}} className="video-slot"><span className="live-badge">AO VIVO</span></div></div>)}
        </div>
        <div className="toolbar"><button className={sharing?'danger':'primary'} onClick={toggleShare}>{sharing?'Parar compartilhamento':'+ Compartilhar minha tela'}</button></div>
      </section>
    </div>
  </main>
}