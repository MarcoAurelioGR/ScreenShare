import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Room, RoomEvent, Track, RemoteTrackPublication, RemoteParticipant,
  LocalParticipant, VideoPresets
} from 'livekit-client';
import { LocalVideoTrack, LocalAudioTrack } from 'livekit-client'; // junto ao import existente

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const HOST_KEY = (id: string) => `screenshare:host:${id}`;

function toggleFullscreen(card: HTMLElement, video: HTMLVideoElement) {
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  if (card.requestFullscreen) card.requestFullscreen();
  else (video as any).webkitEnterFullscreen?.(); // iOS Safari
}

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
    localStorage.setItem(HOST_KEY(data.roomId), data.participantId); // chave do criador
    setRoomCode(data.roomId); setParticipantId(data.participantId); setRole('HOST'); setName(n);
    setPage('room');
  } catch (e) { setError((e as Error).message); }
}

async function enterAsHost(code: string, hostKey: string) {
  try {
    const data = await api(`/api/rooms/${code}/join`, { method: 'POST', body: JSON.stringify({ hostKey }) });
    setRoomCode(code); setParticipantId(data.participantId); setRole('HOST');
    setPage('room');
  } catch (e) {
    localStorage.removeItem(HOST_KEY(code)); // sala não existe mais
    setError((e as Error).message);
  }
}

function startJoin(code: string = roomCode) {
  const c = code.trim().toUpperCase();
  if (!c) return setError('Informe o código da sala.');
  setError(''); setRoomCode(c);
  const hostKey = localStorage.getItem(HOST_KEY(c));
  if (hostKey) { enterAsHost(c, hostKey); return; }
  setPendingAction('join'); setPage('name');
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

  if (page === 'home') return <Home code={roomCode} setCode={setRoomCode}
  onJoin={() => startJoin()} onEnter={startJoin} onCreate={createRoom} error={error} />;
  if (page === 'name') return <NamePage name={name} setName={setName} onBack={() => setPage('home')} onContinue={join} error={error} />;
  if (page === 'waiting') return <Waiting roomCode={roomCode} participantId={participantId} onApproved={() => setPage('room')} onBack={() => setPage('home')} />;
  return <RoomPage roomCode={roomCode} participantId={participantId} role={role} initial={roomState} onLeave={() => { setPage('home'); location.reload(); }} />;
}

type RoomItem = { id: string; hostName: string; participantCount: number; createdAt: number };

function Home({code,setCode,onJoin,onEnter,onCreate,error}:{code:string,setCode:(s:string)=>void,onJoin:()=>void,onEnter:(c:string)=>void,onCreate:()=>void,error:string}) {
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => api('/api/rooms').then(d => alive && setRooms(d)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  function copy(id: string) {
    navigator.clipboard.writeText(id);
    setCopied(id); setTimeout(() => setCopied(''), 1500);
  }

  return <main className="center"><section className="card hero">
    <div className="logo">SCREEN<span>SHARE</span></div>
    <p className="muted">Compartilhamento de tela em tempo real</p>
    <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="Código da sala" maxLength={8} />
    <button className="primary" onClick={onJoin}>Entrar na sala</button>
    <button className="secondary" onClick={onCreate}>Criar sala</button>
    {error && <div className="error">{error}</div>}

    <div className="room-list">
      <h3>Salas abertas</h3>
      {rooms.length === 0 && <p className="muted">Nenhuma sala aberta no momento.</p>}
      {rooms.map(r => {
        const mine = !!localStorage.getItem(HOST_KEY(r.id));
        return <div className="room-item" key={r.id}>
          <div><strong>{r.id}</strong> {mine && <span className="share-tag">SUA SALA</span>}
            <div className="muted">Anfitrião: {r.hostName} · {r.participantCount} na sala</div></div>
          <div>
            <button className="secondary small" onClick={() => copy(r.id)}>{copied === r.id ? 'Copiado!' : 'Copiar código'}</button>
            {mine && <button className="primary small" onClick={() => onEnter(r.id)}>Entrar</button>}
          </div>
        </div>;
      })}
    </div>
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
      if (m.type === 'approved' && m.participant?.id === participantId) onApproved();
      if (m.type === 'rejected' && m.participantId === participantId) onBack();
      if (m.type === 'kicked' || m.type === 'room-closed') onBack();
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

  const shareTracksRef = useRef<(LocalVideoTrack | LocalAudioTrack)[]>([]);
  const [notice, setNotice] = useState('');

  const [isScreenShareSupported, setIsScreenShareSupported] = useState(true);

  useEffect(() => {
    if (!navigator.mediaDevices || !('getDisplayMedia' in navigator.mediaDevices)) {
      setIsScreenShareSupported(false);
    }
  }, []);

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

  async function startShare() {
  const r = roomRef.current; if (!r) return;
  const supported = navigator.mediaDevices.getSupportedConstraints() as any;

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30, width: { max: 1920 }, height: { max: 1080 } },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      ...(supported.windowAudio ? { windowAudio: 'window' } : {})
    } as any
  });

  const [v] = stream.getVideoTracks();
  const surface = v.getSettings().displaySurface; // 'monitor' | 'window' | 'browser'
  let [a] = stream.getAudioTracks();

  // Janela sem suporte a windowAudio: o áudio seria do sistema inteiro -> descarta
  if (a && surface === 'window' && !supported.windowAudio) {
    a.stop();
    a = undefined as any;
    setNotice('Ao compartilhar uma janela, o áudio foi desativado para evitar vazamento de outros apps. Para ter áudio, compartilhe uma aba ou a tela inteira.');
  } else {
    setNotice('');
  }

  const lp = r.localParticipant;
  const vt = new LocalVideoTrack(v);
  await lp.publishTrack(vt, { source: Track.Source.ScreenShare, name: 'screen' });
  shareTracksRef.current = [vt];

  if (a) {
    const at = new LocalAudioTrack(a);
    await lp.publishTrack(at, { source: Track.Source.ScreenShareAudio, name: 'screen-audio' });
    shareTracksRef.current.push(at);
  }

  // Botão "Parar compartilhamento" nativo do navegador
  v.addEventListener('ended', () => { stopShare(); });

  setSharing(true);
  wsRef.current?.readyState === WebSocket.OPEN &&
    wsRef.current.send(JSON.stringify({ type: 'sharing-state', isSharing: true }));
}

async function stopShare() {
  const lp = roomRef.current?.localParticipant;
  for (const t of shareTracksRef.current) {
    try { await lp?.unpublishTrack(t, true); } catch {}
    t.stop();
  }
  shareTracksRef.current = [];
  setSharing(false);
  wsRef.current?.readyState === WebSocket.OPEN &&
    wsRef.current.send(JSON.stringify({ type: 'sharing-state', isSharing: false }));
}

async function toggleShare() {
  try {
    if (sharing) await stopShare(); else await startShare();
  } catch (e) {
    console.error('Erro ao alternar compartilhamento:', e);
    if ((e as DOMException).name !== 'NotAllowedError') {
      alert('Não foi possível compartilhar a tela. Verifique as permissões ou tente novamente.');
    }
    setSharing(false);
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
        <div className="screen-grid">{activeTracks.length===0
  ? <div className="empty"><div className="empty-icon">▣</div><h2>Nenhuma transmissão ativa</h2><p>Compartilhe sua tela para começar.</p></div>
  : activeTracks.map(([key, el]) => (
      <div className="screen-card" key={key}>
        <div ref={n => { if (n && el.parentElement !== n) n.appendChild(el) }} className="video-slot">
          <span className="live-badge">AO VIVO</span>
        </div>
        <button className="fs-btn" onClick={e => toggleFullscreen(e.currentTarget.closest('.screen-card') as HTMLElement, el)}>
          ⛶ Tela cheia
        </button>
      </div>
    ))
}</div>
        <div className="toolbar">{notice && <span className="muted">{notice}</span>}<button 
            className={!isScreenShareSupported ? 'secondary' : (sharing ? 'danger' : 'primary')} 
            onClick={toggleShare}
            disabled={!isScreenShareSupported} // Desabilita se não suportar
          >
            {!isScreenShareSupported 
              ? 'Navegador incompatível' 
              : (sharing ? 'Parar compartilhamento' : '+ Compartilhar minha tela')}
          </button></div>
      </section>
    </div>
  </main>
}