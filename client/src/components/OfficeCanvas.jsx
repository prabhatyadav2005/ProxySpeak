// client/src/components/OfficeCanvas.jsx
import React, { useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useKeyboardMovement } from '../hooks/useKeyboardMovement';
import { useWebRTC } from '../hooks/useWebRTC';
import HUD from './HUD';

// Dynamic backend host resolution
const BACKEND_ORIGIN = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : window.location.origin;

const SOCKET_SERVER_URL = BACKEND_ORIGIN;
const ROOM_API_URL = `${BACKEND_ORIGIN}/api/rooms/main-office/layout`;

const EARSHOT_RADIUS = 100;
const AVATAR_RADIUS = 14;
const SPEED = 4;
const LERP_FACTOR = 0.2;
const DEFAULT_ROOM_ID = 'main-office';

const OFFICE_ZONES = [
  { id: 'zone-lounge', name: 'Lounge Area', x: 20, y: 20, width: 230, height: 260, color: 'rgba(56, 189, 248, 0.05)', border: '#0284c7' },
  { id: 'zone-conf', name: 'Conference Room', x: 270, y: 20, width: 510, height: 260, color: 'rgba(168, 85, 247, 0.05)', border: '#7e22ce' },
  { id: 'zone-work', name: 'Open Workstations', x: 20, y: 300, width: 760, height: 280, color: 'rgba(34, 197, 94, 0.05)', border: '#15803d' }
];

export default function OfficeCanvas() {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const position = useRef({ x: 400, y: 400 });
  const peers = useRef(new Map());
  const activeVoicePeers = useRef(new Set());
  
  const obstacles = useRef([
    { id: 'f-1', label: 'Discussion Table', type: 'table', x: 500, y: 380, width: 140, height: 80 },
    { id: 'f-2', label: 'Whiteboard', type: 'whiteboard', x: 300, y: 40, width: 180, height: 20 },
    { id: 'f-3', label: 'Presentation Stage', type: 'stage', x: 60, y: 40, width: 150, height: 90 }
  ]);
  
  const keys = useKeyboardMovement();

  // WebRTC Mesh & Spatial Audio Hook Integration
  const { toggleMute, updateSpatialAudio } = useWebRTC(socketRef, position, peers);

  const [status, setStatus] = useState('Connecting...');
  const [isMicOn, setIsMicOn] = useState(true);
  const [participantCount, setParticipantCount] = useState(1);
  const [currentZone, setCurrentZone] = useState('Open Space');
  const [fps, setFps] = useState(60);

  const handleToggleMic = () => {
    const isNowActive = toggleMute();
    setIsMicOn(isNowActive);
  };

  const updateCurrentZone = (px, py) => {
    const found = OFFICE_ZONES.find(
      (z) => px >= z.x && px <= z.x + z.width && py >= z.y && py <= z.y + z.height
    );
    setCurrentZone(found ? found.name : 'Open Space');
  };

  const checkCollision = (newX, newY) => {
    for (const item of obstacles.current) {
      const closestX = Math.max(item.x, Math.min(newX, item.x + item.width));
      const closestY = Math.max(item.y, Math.min(newY, item.y + item.height));
      const distanceX = newX - closestX;
      const distanceY = newY - closestY;
      if (distanceX * distanceX + distanceY * distanceY < AVATAR_RADIUS * AVATAR_RADIUS) {
        return true;
      }
    }
    return false;
  };

  useEffect(() => {
    // 1. Fetch Room Layout
    fetch(ROOM_API_URL)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.layout?.furniture?.length) {
          obstacles.current = data.layout.furniture;
        }
      })
      .catch((err) => {
        console.warn('Backend layout unreachable, using defaults:', err.message);
      });

    // 2. Identify Client Role (Player A vs Player B)
    const isPeerWindow = window.location.hash === '#peer' || sessionStorage.getItem('client_role') === 'B';
    if (isPeerWindow) {
      sessionStorage.setItem('client_role', 'B');
    }
    const myPlayerName = isPeerWindow ? 'Player B' : 'Player A';
    const myAvatarColor = isPeerWindow ? '#10b981' : '#2563eb';

    // 3. Initialize Socket Connection
    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('Connected');
      socket.emit('join-room', {
        roomId: DEFAULT_ROOM_ID,
        userId: `user-${socket.id ? socket.id.substring(0, 5) : Math.random().toString(36).substring(2, 7)}`,
        username: myPlayerName,
        initialCoordinates: { x: position.current.x, y: position.current.y },
        avatarColor: myAvatarColor
      });
    });

    socket.on('connect_error', () => {
      setStatus('Connecting...');
    });

    socket.on('disconnect', () => {
      setStatus('Disconnected');
    });

    socket.on('room-joined', ({ self, peers: existingPeers = [] }) => {
      if (self) position.current = { x: self.x, y: self.y };
      existingPeers.forEach((p) => {
        peers.current.set(p.socketId, {
          ...p,
          x: p.x,
          y: p.y,
          targetX: p.x,
          targetY: p.y
        });
      });
      setParticipantCount(existingPeers.length + 1);
    });

    socket.on('player-joined', (newPeer) => {
      peers.current.set(newPeer.socketId, {
        ...newPeer,
        x: newPeer.x,
        y: newPeer.y,
        targetX: newPeer.x,
        targetY: newPeer.y
      });
      setParticipantCount(peers.current.size + 1);
    });

    socket.on('player-moved', ({ socketId, x, y }) => {
      const peer = peers.current.get(socketId);
      if (peer) {
        peer.targetX = x;
        peer.targetY = y;
      }
    });

    socket.on('peer-entered-proximity', ({ peerSocketId }) => {
      activeVoicePeers.current.add(peerSocketId);
    });

    socket.on('peer-left-proximity', ({ peerSocketId }) => {
      activeVoicePeers.current.delete(peerSocketId);
    });

    socket.on('player-left', ({ socketId }) => {
      peers.current.delete(socketId);
      activeVoicePeers.current.delete(socketId);
      setParticipantCount(peers.current.size + 1);
    });

    // 4. Game Animation Loop
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let frameCounter = 0;
    let lastFpsUpdate = performance.now();

    const gameLoop = (currentTime) => {
      frameCounter++;
      if (currentTime - lastFpsUpdate >= 1000) {
        const calculatedFps = Math.round((frameCounter * 1000) / (currentTime - lastFpsUpdate));
        setFps(calculatedFps);
        frameCounter = 0;
        lastFpsUpdate = currentTime;
      }

      let nextX = position.current.x;
      let nextY = position.current.y;
      let hasMoved = false;

      const activeKeys = keys.current || {};
      if (activeKeys['w'] || activeKeys['arrowup']) nextY -= SPEED;
      if (activeKeys['s'] || activeKeys['arrowdown']) nextY += SPEED;
      if (activeKeys['a'] || activeKeys['arrowleft']) nextX -= SPEED;
      if (activeKeys['d'] || activeKeys['arrowright']) nextX += SPEED;

      nextX = Math.max(AVATAR_RADIUS, Math.min(canvas.width - AVATAR_RADIUS, nextX));
      nextY = Math.max(AVATAR_RADIUS, Math.min(canvas.height - AVATAR_RADIUS, nextY));

      if (!checkCollision(nextX, position.current.y)) {
        if (nextX !== position.current.x) {
          position.current.x = nextX;
          hasMoved = true;
        }
      }
      if (!checkCollision(position.current.x, nextY)) {
        if (nextY !== position.current.y) {
          position.current.y = nextY;
          hasMoved = true;
        }
      }

      if (hasMoved) {
        updateCurrentZone(position.current.x, position.current.y);
        if (socketRef.current?.connected) {
          socketRef.current.emit('player-move', {
            x: position.current.x,
            y: position.current.y
          });
        }
      }

      // Update Web Audio distance attenuation and stereo panning for active peers
      activeVoicePeers.current.forEach((peerId) => {
        updateSpatialAudio(peerId);
      });

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Floor Grid
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Office Zones
      OFFICE_ZONES.forEach((zone) => {
        ctx.fillStyle = zone.color;
        ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
        ctx.strokeStyle = zone.border;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
        ctx.setLineDash([]);

        ctx.font = '12px sans-serif';
        ctx.fillStyle = zone.border;
        ctx.textAlign = 'left';
        ctx.fillText(zone.name.toUpperCase(), zone.x + 10, zone.y + 20);
      });

      // Furniture Obstacles
      obstacles.current.forEach((item) => {
        ctx.fillStyle = item.type === 'stage' ? '#334155' : item.type === 'whiteboard' ? '#f1f5f9' : '#475569';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.fillRect(item.x, item.y, item.width, item.height);
        ctx.strokeRect(item.x, item.y, item.width, item.height);

        ctx.font = '11px sans-serif';
        ctx.fillStyle = item.type === 'whiteboard' ? '#0f172a' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(item.label || item.type, item.x + item.width / 2, item.y + item.height / 2 + 4);
      });

      // Local Player & Earshot Ring
      ctx.beginPath();
      ctx.arc(position.current.x, position.current.y, EARSHOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(position.current.x, position.current.y, AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = myAvatarColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(`You (${myPlayerName})`, position.current.x, position.current.y - AVATAR_RADIUS - 6);

      // Remote Peers (Smooth Lerped)
      peers.current.forEach((peer, peerId) => {
        peer.x += (peer.targetX - peer.x) * LERP_FACTOR;
        peer.y += (peer.targetY - peer.y) * LERP_FACTOR;

        const inVoice = activeVoicePeers.current.has(peerId);

        if (inVoice) {
          ctx.beginPath();
          ctx.arc(peer.x, peer.y, AVATAR_RADIUS + 6, 0, Math.PI * 2);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(peer.x, peer.y, AVATAR_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = peer.avatarColor || '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        const displayName = (peer.username && !peer.username.startsWith('Player_') && !peer.username.startsWith('user-'))
          ? peer.username
          : (myPlayerName === 'Player A' ? 'Player B' : 'Player A');

        ctx.font = '12px sans-serif';
        ctx.fillStyle = inVoice ? '#34d399' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(displayName, peer.x, peer.y - AVATAR_RADIUS - 6);
      });

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      socket.disconnect();
    };
  }, [keys]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
      <HUD
        status={status}
        participantCount={participantCount}
        isMicOn={isMicOn}
        onToggleMic={handleToggleMic}
        currentZone={currentZone}
        fps={fps}
      />
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{
          background: '#0f172a',
          borderRadius: '0 0 8px 8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          border: '1px solid #334155'
        }}
      />
    </div>
  );
}