import React, { useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useKeyboardMovement } from '../hooks/useKeyboardMovement';

const SOCKET_SERVER_URL = 'http://localhost:5000';
const ROOM_API_URL = 'http://localhost:5000/api/rooms/main-office/layout';
const EARSHOT_RADIUS = 100; // 100px proximity voice threshold
const AVATAR_RADIUS = 14;
const SPEED = 4;
const DEFAULT_ROOM_ID = 'main-office';

export default function OfficeCanvas() {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const position = useRef({ x: 400, y: 300 });
  const peers = useRef(new Map());
  const activeVoicePeers = useRef(new Set());
  const obstacles = useRef([]); // Stores room furniture loaded from API
  const keys = useKeyboardMovement();
  const [status, setStatus] = useState('Connecting...');

  // Helper: Check if avatar circle collides with rectangular obstacle
  const checkCollision = (newX, newY) => {
    for (const item of obstacles.current) {
      // Find closest point on obstacle rectangle to circle center
      const closestX = Math.max(item.x, Math.min(newX, item.x + item.width));
      const closestY = Math.max(item.y, Math.min(newY, item.y + item.height));

      // Calculate distance between circle center and closest point
      const distanceX = newX - closestX;
      const distanceY = newY - closestY;
      const distanceSquared = distanceX * distanceX + distanceY * distanceY;

      if (distanceSquared < AVATAR_RADIUS * AVATAR_RADIUS) {
        return true; // Collision detected!
      }
    }
    return false;
  };

  useEffect(() => {
    // 1. Fetch Room Layout & Furniture from Backend
    fetch(ROOM_API_URL)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.layout?.furniture) {
          obstacles.current = data.layout.furniture;
        }
      })
      .catch((err) => console.warn('[Layout Fetch Notice] Using default in-memory layout:', err));

    // 2. Connect to Socket.io Signaling Engine
    const socket = io(SOCKET_SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('Connected');
      socket.emit('join-room', {
        roomId: DEFAULT_ROOM_ID,
        userId: `user-${socket.id.substring(0, 5)}`,
        username: `Player_${socket.id.substring(0, 4)}`,
        initialCoordinates: { x: position.current.x, y: position.current.y },
        avatarColor: '#2563eb'
      });
    });

    socket.on('room-joined', ({ self, peers: existingPeers }) => {
      if (self) {
        position.current = { x: self.x, y: self.y };
      }
      existingPeers.forEach((p) => peers.current.set(p.socketId, p));
    });

    socket.on('player-joined', (newPeer) => {
      peers.current.set(newPeer.socketId, newPeer);
    });

    socket.on('player-moved', ({ socketId, x, y }) => {
      const peer = peers.current.get(socketId);
      if (peer) {
        peer.x = x;
        peer.y = y;
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
    });

    // 3. 60 FPS Canvas Game Loop
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const gameLoop = () => {
      let nextX = position.current.x;
      let nextY = position.current.y;
      let hasMoved = false;

      // Calculate desired new position
      if (keys.current['w'] || keys.current['arrowup']) nextY -= SPEED;
      if (keys.current['s'] || keys.current['arrowdown']) nextY += SPEED;
      if (keys.current['a'] || keys.current['arrowleft']) nextX -= SPEED;
      if (keys.current['d'] || keys.current['arrowright']) nextX += SPEED;

      // Keep within canvas borders
      nextX = Math.max(AVATAR_RADIUS, Math.min(canvas.width - AVATAR_RADIUS, nextX));
      nextY = Math.max(AVATAR_RADIUS, Math.min(canvas.height - AVATAR_RADIUS, nextY));

      // Apply collision detection: only apply movement if no obstacle collision
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

      // Stream updated coordinates to server
      if (hasMoved && socketRef.current?.connected) {
        socketRef.current.emit('player-move', {
          x: position.current.x,
          y: position.current.y
        });
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // --- Draw Furniture / Obstacles ---
      obstacles.current.forEach((item) => {
        ctx.fillStyle = item.type === 'stage' ? '#334155' : item.type === 'whiteboard' ? '#f1f5f9' : '#475569';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.fillRect(item.x, item.y, item.width, item.height);
        ctx.strokeRect(item.x, item.y, item.width, item.height);

        // Label
        ctx.font = '11px sans-serif';
        ctx.fillStyle = item.type === 'whiteboard' ? '#0f172a' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(item.label || item.type, item.x + item.width / 2, item.y + item.height / 2 + 4);
      });

      // --- Draw Local Player & Earshot Ring ---
      ctx.beginPath();
      ctx.arc(position.current.x, position.current.y, EARSHOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(position.current.x, position.current.y, AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('You', position.current.x, position.current.y - AVATAR_RADIUS - 6);

      // --- Draw Peer Players ---
      peers.current.forEach((peer, peerId) => {
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

        ctx.font = '12px sans-serif';
        ctx.fillStyle = inVoice ? '#34d399' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(peer.username || `User ${peerId.substring(0, 4)}`, peer.x, peer.y - AVATAR_RADIUS - 6);
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
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ color: '#0f172a', margin: 0 }}>ProxiSpeak Virtual Workspace</h2>
        <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', background: '#e2e8f0', color: '#334155' }}>
          Status: {status}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{
          background: '#0f172a',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          border: '1px solid #334155'
        }}
      />
    </div>
  );
}