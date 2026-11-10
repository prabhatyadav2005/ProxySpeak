// client/src/components/OfficeCanvas.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { io } from 'socket.io-client';
import { useKeyboardMovement } from '../hooks/useKeyboardMovement';
import { useWebRTC } from '../hooks/useWebRTC';
import HUD from './HUD';
import ParticipantsDrawer from './ParticipantsDrawer';
import QuickReactions from './QuickReactions';
import SpatialRadar from './SpatialRadar';

// Backend Origin Resolution (supports localhost, local network IP, or deployed domain)
const BACKEND_ORIGIN =
  window.location.port === '5173'
    ? `http://${window.location.hostname}:5000`
    : window.location.origin;

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 650;
const AVATAR_RADIUS = 16;
const SPEED = 4.2;
const LERP_FACTOR = 0.22;
const DEFAULT_EARSHOT_RADIUS = 130;

export default function OfficeCanvas({ userProfile, onLeaveRoom }) {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);

  // Position, direction and movement target
  const position = useRef({ x: 450, y: 480 });
  const direction = useRef('down');
  const targetDestination = useRef(null); // Click-to-move destination

  // Peers map: Map<socketId, PeerState>
  const peers = useRef(new Map());
  const activeVoicePeers = useRef(new Set());
  const activeReactions = useRef([]); // [{ id, socketId, emoji, x, y, progress, alpha }]

  // Visual FX systems (Particles, Footstep ripples, Sparkles)
  const ambientParticles = useRef(
    Array.from({ length: 36 }, () => ({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      radius: Math.random() * 2 + 1,
      alpha: Math.random() * 0.4 + 0.15,
      speedX: (Math.random() - 0.5) * 0.35,
      speedY: (Math.random() - 0.5) * 0.35,
      color: Math.random() > 0.5 ? '#38bdf8' : '#10b981'
    }))
  );
  const footsteps = useRef([]); // [{ x, y, radius, alpha, color }]
  const lastFootstepPos = useRef({ x: 450, y: 480 });
  const sparkles = useRef([]); // [{ x, y, vx, vy, size, alpha, color }]

  // Dynamic obstacles & zones loaded from server
  const obstacles = useRef([
    { id: 'f-1', label: 'Oval Board Table', type: 'table', x: 500, y: 110, width: 170, height: 90 },
    { id: 'f-2', label: 'Digital Whiteboard', type: 'whiteboard', x: 320, y: 40, width: 140, height: 22 },
    { id: 'f-3', label: 'Keynote Stage', type: 'stage', x: 45, y: 45, width: 150, height: 95 },
    { id: 'f-4', label: 'Coffee & Refreshments', type: 'table', x: 50, y: 195, width: 90, height: 65 },
    { id: 'f-5', label: 'Dev Desk Alpha', type: 'table', x: 120, y: 370, width: 220, height: 80 },
    { id: 'f-6', label: 'Dev Desk Beta', type: 'table', x: 520, y: 370, width: 220, height: 80 }
  ]);

  const zones = useRef([
    { id: 'zone-lounge', name: 'Cyber Lounge', x: 25, y: 25, width: 250, height: 260, color: 'rgba(56, 189, 248, 0.06)', border: '#0284c7' },
    { id: 'zone-conf', name: 'Executive Conference Room', x: 300, y: 25, width: 575, height: 260, color: 'rgba(168, 85, 247, 0.06)', border: '#9333ea' },
    { id: 'zone-work', name: 'Open Engineering Pods', x: 25, y: 310, width: 850, height: 315, color: 'rgba(34, 197, 94, 0.06)', border: '#16a34a' }
  ]);

  const keys = useKeyboardMovement();

  // Component States
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [currentZone, setCurrentZone] = useState('Open Space');
  const [participantList, setParticipantList] = useState([]);
  const [fps, setFps] = useState(60);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isRadarOpen, setIsRadarOpen] = useState(false);
  const [voicePeerCount, setVoicePeerCount] = useState(0);

  // WebRTC Spatial Audio Hook
  const {
    isMuted,
    isDeafened,
    isLocalSpeaking,
    toggleMute,
    toggleDeafen,
    updateAllSpatialAudio,
    ensureAudioContext
  } = useWebRTC({
    socket: socketRef.current,
    localPositionRef: position,
    peersRef: peers,
    initialMuted: userProfile.isMuted,
    earshotRadius: DEFAULT_EARSHOT_RADIUS
  });

  // Calculate current zone
  const updateCurrentZone = useCallback((px, py) => {
    const found = zones.current.find(
      (z) => px >= z.x && px <= z.x + z.width && py >= z.y && py <= z.y + z.height
    );
    const newZone = found ? found.name : 'Open Space';
    setCurrentZone(newZone);
    return newZone;
  }, []);

  // Circle vs AABB Collision Check
  const checkCollision = useCallback((newX, newY) => {
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
  }, []);

  // Handle floor click for tap-to-move
  const handleCanvasClick = (e) => {
    ensureAudioContext();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Constrain within walls
    const clampedX = Math.max(AVATAR_RADIUS + 10, Math.min(CANVAS_WIDTH - AVATAR_RADIUS - 10, clickX));
    const clampedY = Math.max(AVATAR_RADIUS + 10, Math.min(CANVAS_HEIGHT - AVATAR_RADIUS - 10, clickY));

    if (!checkCollision(clampedX, clampedY)) {
      targetDestination.current = { x: clampedX, y: clampedY, time: performance.now() };
    }
  };

  // Keyboard shortcut for Mute (Key M)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key.toLowerCase() === 'm' && !['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) {
        toggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleMute]);

  // Send Floating Reaction with Sparkle Burst
  const handleSendReaction = (emoji) => {
    ensureAudioContext();
    if (socketRef.current?.connected) {
      socketRef.current.emit('send-reaction', { emoji });
    }

    const rx = position.current.x;
    const ry = position.current.y - AVATAR_RADIUS - 10;

    // Spawn 16 radial sparkle particles
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.3;
      const speed = Math.random() * 2.8 + 1.2;
      sparkles.current.push({
        x: rx,
        y: ry,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 2,
        alpha: 1,
        color: ['#38bdf8', '#10b981', '#f59e0b', '#f43f5e', '#a855f7'][Math.floor(Math.random() * 5)]
      });
    }

    activeReactions.current.push({
      id: `local-${Date.now()}-${Math.random()}`,
      emoji,
      x: rx,
      y: ry,
      startY: ry,
      createdAt: performance.now()
    });
  };

  // Auto walk towards a peer when clicked from participants drawer
  const handleWalkToPeer = (peer) => {
    if (!peer) return;
    targetDestination.current = {
      x: Math.max(AVATAR_RADIUS + 10, Math.min(CANVAS_WIDTH - AVATAR_RADIUS - 10, peer.x - 35)),
      y: Math.max(AVATAR_RADIUS + 10, Math.min(CANVAS_HEIGHT - AVATAR_RADIUS - 10, peer.y)),
      time: performance.now()
    };
  };

  // Setup Socket Connection & Room Lifecycle
  useEffect(() => {
    fetch(`${BACKEND_ORIGIN}/api/rooms/${userProfile.roomId}/layout`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.layout) {
          if (data.layout.furniture?.length) obstacles.current = data.layout.furniture;
          if (data.layout.zones?.length) zones.current = data.layout.zones;
          if (data.layout.defaultSpawnPoint) {
            position.current = { ...data.layout.defaultSpawnPoint };
            lastFootstepPos.current = { ...data.layout.defaultSpawnPoint };
          }
        }
      })
      .catch((err) => {
        console.warn('[Layout Notice] Using default layout config:', err.message);
      });

    const socket = io(BACKEND_ORIGIN, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('Connected');
      socket.emit('join-room', {
        roomId: userProfile.roomId,
        userId: `user-${socket.id?.substring(0, 5) || Math.random().toString(36).substring(2, 7)}`,
        username: userProfile.username,
        avatarColor: userProfile.avatarColor,
        initialCoordinates: { x: position.current.x, y: position.current.y },
        isMuted: userProfile.isMuted
      });
    });

    socket.on('connect_error', () => setConnectionStatus('Connecting...'));
    socket.on('disconnect', () => setConnectionStatus('Disconnected'));

    socket.on('room-joined', ({ self, peers: existingPeers = [] }) => {
      if (self) {
        position.current = { x: self.x, y: self.y };
        lastFootstepPos.current = { x: self.x, y: self.y };
        if (self.direction) direction.current = self.direction;
      }
      peers.current.clear();
      existingPeers.forEach((p) => {
        peers.current.set(p.socketId, {
          ...p,
          targetX: p.x,
          targetY: p.y,
          direction: p.direction || 'down',
          isSpeaking: false,
          audioLevel: 0
        });
      });
      setParticipantList(Array.from(peers.current.values()));
    });

    socket.on('player-joined', (newPeer) => {
      peers.current.set(newPeer.socketId, {
        ...newPeer,
        targetX: newPeer.x,
        targetY: newPeer.y,
        direction: newPeer.direction || 'down',
        isSpeaking: false,
        audioLevel: 0
      });
      setParticipantList(Array.from(peers.current.values()));
    });

    socket.on('player-moved', ({ socketId, x, y, direction: peerDir, currentZone: pZone }) => {
      const peer = peers.current.get(socketId);
      if (peer) {
        peer.targetX = x;
        peer.targetY = y;
        if (peerDir) peer.direction = peerDir;
        if (pZone) peer.currentZone = pZone;
      }
    });

    socket.on('user-speaking-update', ({ socketId, isSpeaking, audioLevel }) => {
      const peer = peers.current.get(socketId);
      if (peer) {
        peer.isSpeaking = isSpeaking;
        peer.audioLevel = audioLevel || 0;
      }
    });

    socket.on('user-mute-update', ({ socketId, isMuted: peerMuted }) => {
      const peer = peers.current.get(socketId);
      if (peer) {
        peer.isMuted = peerMuted;
      }
    });

    socket.on('peer-reaction', ({ socketId, emoji }) => {
      const peer = peers.current.get(socketId);
      const rx = peer ? peer.x : position.current.x;
      const ry = peer ? peer.y - AVATAR_RADIUS - 10 : position.current.y - AVATAR_RADIUS - 10;

      // Spawn sparkle burst on peer reaction
      for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.3;
        const speed = Math.random() * 2.8 + 1.2;
        sparkles.current.push({
          x: rx,
          y: ry,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 3 + 2,
          alpha: 1,
          color: ['#38bdf8', '#10b981', '#f59e0b', '#f43f5e', '#a855f7'][Math.floor(Math.random() * 5)]
        });
      }

      activeReactions.current.push({
        id: `react-${Date.now()}-${Math.random()}`,
        emoji,
        x: rx,
        y: ry,
        startY: ry,
        createdAt: performance.now()
      });
    });

    socket.on('peer-entered-proximity', ({ peerSocketId }) => {
      activeVoicePeers.current.add(peerSocketId);
      setVoicePeerCount(activeVoicePeers.current.size);
    });

    socket.on('peer-left-proximity', ({ peerSocketId }) => {
      activeVoicePeers.current.delete(peerSocketId);
      setVoicePeerCount(activeVoicePeers.current.size);
    });

    socket.on('player-left', ({ socketId }) => {
      peers.current.delete(socketId);
      activeVoicePeers.current.delete(socketId);
      setVoicePeerCount(activeVoicePeers.current.size);
      setParticipantList(Array.from(peers.current.values()));
    });

    return () => socket.disconnect();
  }, [userProfile]);

  // Main 60 FPS Canvas Rendering Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let frameCount = 0;
    let lastFpsTime = performance.now();
    let pulseAngle = 0;

    const dirAngles = {
      up: -Math.PI / 2,
      down: Math.PI / 2,
      left: Math.PI,
      right: 0
    };

    const renderLoop = (time) => {
      frameCount++;
      if (time - lastFpsTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (time - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = time;
      }

      pulseAngle = (pulseAngle + 0.04) % (Math.PI * 2);

      // 1. Locomotion Physics
      let nextX = position.current.x;
      let nextY = position.current.y;
      let hasMoved = false;
      let newDirection = direction.current;

      const activeKeys = keys.current || {};
      let inputDx = 0;
      let inputDy = 0;

      if (activeKeys['w'] || activeKeys['arrowup']) { inputDy -= 1; newDirection = 'up'; }
      if (activeKeys['s'] || activeKeys['arrowdown']) { inputDy += 1; newDirection = 'down'; }
      if (activeKeys['a'] || activeKeys['arrowleft']) { inputDx -= 1; newDirection = 'left'; }
      if (activeKeys['d'] || activeKeys['arrowright']) { inputDx += 1; newDirection = 'right'; }

      if (inputDx !== 0 || inputDy !== 0) {
        targetDestination.current = null;
        const mag = Math.hypot(inputDx, inputDy);
        nextX += (inputDx / mag) * SPEED;
        nextY += (inputDy / mag) * SPEED;
      } else if (targetDestination.current) {
        const tx = targetDestination.current.x;
        const ty = targetDestination.current.y;
        const dx = tx - nextX;
        const dy = ty - nextY;
        const dist = Math.hypot(dx, dy);

        if (dist <= SPEED) {
          nextX = tx;
          nextY = ty;
          targetDestination.current = null;
        } else {
          nextX += (dx / dist) * SPEED;
          nextY += (dy / dist) * SPEED;
          newDirection = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        }
      }

      nextX = Math.max(AVATAR_RADIUS + 8, Math.min(CANVAS_WIDTH - AVATAR_RADIUS - 8, nextX));
      nextY = Math.max(AVATAR_RADIUS + 8, Math.min(CANVAS_HEIGHT - AVATAR_RADIUS - 8, nextY));

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

      direction.current = newDirection;

      if (hasMoved) {
        // Spawn footstep energy ripple when moving
        const distSinceLastStep = Math.hypot(position.current.x - lastFootstepPos.current.x, position.current.y - lastFootstepPos.current.y);
        if (distSinceLastStep > 20) {
          footsteps.current.push({
            x: position.current.x,
            y: position.current.y + 4,
            radius: 5,
            alpha: 0.55,
            color: userProfile.avatarColor || '#38bdf8'
          });
          lastFootstepPos.current = { x: position.current.x, y: position.current.y };
        }

        const zoneName = updateCurrentZone(position.current.x, position.current.y);
        updateAllSpatialAudio();

        if (socketRef.current?.connected) {
          socketRef.current.emit('player-move', {
            x: position.current.x,
            y: position.current.y,
            direction: direction.current,
            currentZone: zoneName
          });
        }
      }

      // 2. Clear Canvas & Draw Base Floor
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#070a12';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 3. Cyber Ambient Lighting Glow (Radial gradient around user)
      const ambientLight = ctx.createRadialGradient(
        position.current.x, position.current.y, 20,
        position.current.x, position.current.y, 380
      );
      ambientLight.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
      ambientLight.addColorStop(0.5, 'rgba(15, 23, 42, 0.04)');
      ambientLight.addColorStop(1, 'rgba(7, 10, 18, 0)');
      ctx.fillStyle = ambientLight;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 4. Tech Floor Grid with Illuminated Intersection Points
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 45;
      for (let x = 0; x < CANVAS_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < CANVAS_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }

      // 5. Floating Ambient Tech Motes (Dust particles)
      ambientParticles.current.forEach((mote) => {
        mote.x = (mote.x + mote.speedX + CANVAS_WIDTH) % CANVAS_WIDTH;
        mote.y = (mote.y + mote.speedY + CANVAS_HEIGHT) % CANVAS_HEIGHT;

        ctx.beginPath();
        ctx.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
        ctx.fillStyle = mote.color;
        ctx.globalAlpha = mote.alpha * (0.7 + Math.sin(pulseAngle + mote.x) * 0.3);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // 6. Fading Footstep Energy Ripples
      for (let i = footsteps.current.length - 1; i >= 0; i--) {
        const step = footsteps.current[i];
        step.radius += 0.45;
        step.alpha -= 0.016;

        if (step.alpha <= 0) {
          footsteps.current.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(step.x, step.y, step.radius, 0, Math.PI * 2);
        ctx.strokeStyle = step.color;
        ctx.globalAlpha = Math.max(0, step.alpha);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // 7. Render Office Zones with Glowing Corner Tech Brackets
      zones.current.forEach((zone) => {
        ctx.fillStyle = zone.color;
        ctx.fillRect(zone.x, zone.y, zone.width, zone.height);

        ctx.strokeStyle = zone.border;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
        ctx.setLineDash([]);

        // Futuristic Corner Tech Brackets
        const bracketLen = 14;
        ctx.strokeStyle = zone.border;
        ctx.lineWidth = 2.5;

        // Top-Left
        ctx.beginPath();
        ctx.moveTo(zone.x, zone.y + bracketLen);
        ctx.lineTo(zone.x, zone.y);
        ctx.lineTo(zone.x + bracketLen, zone.y);
        ctx.stroke();

        // Top-Right
        ctx.beginPath();
        ctx.moveTo(zone.x + zone.width - bracketLen, zone.y);
        ctx.lineTo(zone.x + zone.width, zone.y);
        ctx.lineTo(zone.x + zone.width, zone.y + bracketLen);
        ctx.stroke();

        // Bottom-Left
        ctx.beginPath();
        ctx.moveTo(zone.x, zone.y + zone.height - bracketLen);
        ctx.lineTo(zone.x, zone.y + zone.height);
        ctx.lineTo(zone.x + bracketLen, zone.y + zone.height);
        ctx.stroke();

        // Bottom-Right
        ctx.beginPath();
        ctx.moveTo(zone.x + zone.width - bracketLen, zone.y + zone.height);
        ctx.lineTo(zone.x + zone.width, zone.y + zone.height);
        ctx.lineTo(zone.x + zone.width, zone.y + zone.height - bracketLen);
        ctx.stroke();

        // Zone Name Header Pill
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(zone.x + 8, zone.y + 8, zone.name.length * 7.5 + 24, 22);
        ctx.strokeStyle = zone.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(zone.x + 8, zone.y + 8, zone.name.length * 7.5 + 24, 22);

        ctx.font = 'bold 11px Plus Jakarta Sans, sans-serif';
        ctx.fillStyle = zone.border;
        ctx.textAlign = 'left';
        ctx.fillText(zone.name.toUpperCase(), zone.x + 16, zone.y + 23);
      });

      // 8. Render Furniture & Obstacles with Detailed Accents
      obstacles.current.forEach((item) => {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;

        if (item.type === 'stage') {
          ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
          ctx.strokeStyle = '#38bdf8';
        } else if (item.type === 'whiteboard') {
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#0284c7';
        } else if (item.type === 'zone') {
          ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
          ctx.strokeStyle = '#6366f1';
        } else {
          ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
          ctx.strokeStyle = '#475569';
        }

        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(item.x, item.y, item.width, item.height);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Bevel Accent Line on Tables
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(item.x + 4, item.y + 4);
        ctx.lineTo(item.x + item.width - 4, item.y + 4);
        ctx.stroke();

        ctx.font = '500 11px Plus Jakarta Sans, sans-serif';
        ctx.fillStyle = item.type === 'whiteboard' ? '#0f172a' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(item.label || item.type, item.x + item.width / 2, item.y + item.height / 2 + 4);
      });

      // 9. Click-to-Move Target Waypoint Holographic Reticle
      if (targetDestination.current) {
        const tx = targetDestination.current.x;
        const ty = targetDestination.current.y;
        const waypointAge = (performance.now() - targetDestination.current.time) * 0.005;

        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(waypointAge * 2);

        // Rotating outer brackets
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 11, Math.PI, Math.PI * 1.5);
        ctx.stroke();

        ctx.restore();

        // Pulsing core ping
        ctx.beginPath();
        ctx.arc(tx, ty, 3 + Math.sin(waypointAge * 6) * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
      }

      // 10. Photon Energy Laser Tethers & Traveling Signal Beads
      peers.current.forEach((peer, peerSocketId) => {
        const inVoice = activeVoicePeers.current.has(peerSocketId);
        if (inVoice) {
          const dx = peer.x - position.current.x;
          const dy = peer.y - position.current.y;
          const dist = Math.hypot(dx, dy);
          const proximityAlpha = Math.max(0.2, 1 - dist / DEFAULT_EARSHOT_RADIUS);

          // Outer Laser Glow
          ctx.save();
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 12;

          ctx.beginPath();
          ctx.moveTo(position.current.x, position.current.y);
          ctx.lineTo(peer.x, peer.y);
          ctx.strokeStyle = `rgba(16, 185, 129, ${proximityAlpha * 0.85})`;
          ctx.lineWidth = 2.2;
          ctx.stroke();

          // Inner crisp energy core
          ctx.beginPath();
          ctx.moveTo(position.current.x, position.current.y);
          ctx.lineTo(peer.x, peer.y);
          ctx.strokeStyle = `rgba(255, 255, 255, ${proximityAlpha * 0.7})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();

          // Traveling Photon Energy Beads along the beam
          const beadCount = 3;
          for (let b = 0; b < beadCount; b++) {
            const beadProgress = ((performance.now() * 0.0012 + b / beadCount) % 1.0);
            const bx = position.current.x + dx * beadProgress;
            const by = position.current.y + dy * beadProgress;

            ctx.beginPath();
            ctx.arc(bx, by, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#34d399';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;
          }

          // Midpoint Holographic Telemetry Pill with Live Waveform Bars
          const midX = (position.current.x + peer.x) / 2;
          const midY = (position.current.y + peer.y) / 2;
          const volPercent = Math.round((1 - dist / DEFAULT_EARSHOT_RADIUS) * 100);

          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(midX - 44, midY - 12, 88, 24);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1;
          ctx.strokeRect(midX - 44, midY - 12, 88, 24);

          // Mini dancing audio spectrum bars inside badge
          const barCount = 4;
          for (let b = 0; b < barCount; b++) {
            const barH = 3 + Math.abs(Math.sin(pulseAngle * 4 + b * 1.2)) * 8;
            ctx.fillStyle = '#10b981';
            ctx.fillRect(midX - 38 + b * 5, midY + 4 - barH / 2, 3, barH);
          }

          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = '#34d399';
          ctx.textAlign = 'left';
          ctx.fillText(`${volPercent}% VOL`, midX - 12, midY + 3);
        }
      });

      // 11. Spatial Audio Range Circles & Acoustic Ripple Waves
      // Audible Dropoff Outer Circle (dashed cyan)
      ctx.beginPath();
      ctx.arc(position.current.x, position.current.y, DEFAULT_EARSHOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Subtle dynamic breath pulse inside earshot radius
      const breathRadius = DEFAULT_EARSHOT_RADIUS + Math.sin(pulseAngle) * 4;
      ctx.beginPath();
      ctx.arc(position.current.x, position.current.y, breathRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Spectacular Harmonic Audio Shockwaves when User is Speaking
      if (isLocalSpeaking && !isMuted) {
        const waveOffsets = [0, 16, 32];
        waveOffsets.forEach((offset, idx) => {
          const currentR = AVATAR_RADIUS + ((pulseAngle * 18 + offset) % 48);
          const waveAlpha = Math.max(0, 0.75 - currentR / 64);

          // Harmonic wavy lobes
          ctx.beginPath();
          const lobes = 8;
          for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.1) {
            const rOffset = Math.sin(a * lobes + pulseAngle * 6) * 3.5;
            const r = currentR + rOffset;
            const px = position.current.x + Math.cos(a) * r;
            const py = position.current.y + Math.sin(a) * r;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.strokeStyle = idx % 2 === 0 ? `rgba(16, 185, 129, ${waveAlpha})` : `rgba(56, 189, 248, ${waveAlpha})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }

      // 12. Directional Auditory Perception Cone (Hearing Arc)
      const facingAngle = dirAngles[direction.current] || Math.PI / 2;
      ctx.save();
      ctx.translate(position.current.x, position.current.y);

      const coneGradient = ctx.createRadialGradient(0, 0, 10, 0, 0, 95);
      coneGradient.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
      coneGradient.addColorStop(0.7, 'rgba(56, 189, 248, 0.04)');
      coneGradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = coneGradient;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 95, facingAngle - 0.45, facingAngle + 0.45);
      ctx.closePath();
      ctx.fill();

      // Subtle cone edge boundary
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 95, facingAngle - 0.45, facingAngle + 0.45);
      ctx.stroke();
      ctx.restore();

      // 13. Local Player Avatar Core & Halo
      ctx.save();
      ctx.shadowColor = userProfile.avatarColor || '#38bdf8';
      ctx.shadowBlur = isLocalSpeaking ? 24 : 14;

      ctx.beginPath();
      ctx.arc(position.current.x, position.current.y, AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = userProfile.avatarColor || '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();

      // Direction Pointer / Arrow
      const dirOffsets = {
        up: { dx: 0, dy: -AVATAR_RADIUS - 6, angle: -Math.PI / 2 },
        down: { dx: 0, dy: AVATAR_RADIUS + 6, angle: Math.PI / 2 },
        left: { dx: -AVATAR_RADIUS - 6, dy: 0, angle: Math.PI },
        right: { dx: AVATAR_RADIUS + 6, dy: 0, angle: 0 }
      };
      const pointer = dirOffsets[direction.current] || dirOffsets.down;

      ctx.save();
      ctx.translate(position.current.x + pointer.dx, position.current.y + pointer.dy);
      ctx.rotate(pointer.angle);
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

      // Avatar Initial
      ctx.font = 'bold 12px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(
        userProfile.username ? userProfile.username.charAt(0).toUpperCase() : 'U',
        position.current.x,
        position.current.y + 4
      );

      // Name Tag Pill with Glassmorphism
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(position.current.x - 48, position.current.y - AVATAR_RADIUS - 23, 96, 17);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(position.current.x - 48, position.current.y - AVATAR_RADIUS - 23, 96, 17);

      ctx.font = '600 10px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${userProfile.username || 'You'} (You)`,
        position.current.x,
        position.current.y - AVATAR_RADIUS - 11
      );

      if (isMuted) {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(position.current.x + AVATAR_RADIUS - 2, position.current.y + AVATAR_RADIUS - 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '8px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('✕', position.current.x + AVATAR_RADIUS - 2, position.current.y + AVATAR_RADIUS + 1);
      }

      // 14. Remote Peers with Smooth Lerping & Harmonic Waves
      peers.current.forEach((peer, peerSocketId) => {
        const prevPx = peer.x;
        const prevPy = peer.y;

        peer.x += (peer.targetX - peer.x) * LERP_FACTOR;
        peer.y += (peer.targetY - peer.y) * LERP_FACTOR;

        // Peer footstep ripples
        if (Math.hypot(peer.x - prevPx, peer.y - prevPy) > 1.2) {
          if (!peer.lastStepDist || Math.hypot(peer.x - peer.lastStepX, peer.y - peer.lastStepY) > 22) {
            footsteps.current.push({
              x: peer.x,
              y: peer.y + 4,
              radius: 5,
              alpha: 0.5,
              color: peer.avatarColor || '#10b981'
            });
            peer.lastStepX = peer.x;
            peer.lastStepY = peer.y;
          }
        }

        const inVoice = activeVoicePeers.current.has(peerSocketId);

        // Harmonic Soundwave Rings on Speaking Peer
        if (peer.isSpeaking) {
          const currentR = AVATAR_RADIUS + ((pulseAngle * 16) % 40);
          const waveAlpha = Math.max(0, 0.7 - currentR / 45);

          ctx.beginPath();
          const lobes = 8;
          for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.1) {
            const rOffset = Math.sin(a * lobes + pulseAngle * 6) * 3;
            const r = currentR + rOffset;
            const px = peer.x + Math.cos(a) * r;
            const py = peer.y + Math.sin(a) * r;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.strokeStyle = `rgba(16, 185, 129, ${waveAlpha})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Active Voice Proximity Halo
        if (inVoice) {
          ctx.beginPath();
          ctx.arc(peer.x, peer.y, AVATAR_RADIUS + 7, 0, Math.PI * 2);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.save();
        ctx.shadowColor = peer.avatarColor || '#10b981';
        ctx.shadowBlur = inVoice ? 20 : 10;

        ctx.beginPath();
        ctx.arc(peer.x, peer.y, AVATAR_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = peer.avatarColor || '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        const peerPointer = dirOffsets[peer.direction] || dirOffsets.down;
        ctx.save();
        ctx.translate(peer.x + peerPointer.dx, peer.y + peerPointer.dy);
        ctx.rotate(peerPointer.angle);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-5, -5);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();

        ctx.font = 'bold 12px Plus Jakarta Sans, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(
          peer.username ? peer.username.charAt(0).toUpperCase() : 'P',
          peer.x,
          peer.y + 4
        );

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(peer.x - 48, peer.y - AVATAR_RADIUS - 23, 96, 17);
        ctx.strokeStyle = inVoice ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(peer.x - 48, peer.y - AVATAR_RADIUS - 23, 96, 17);

        ctx.font = '600 10px Plus Jakarta Sans, sans-serif';
        ctx.fillStyle = inVoice ? '#34d399' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(
          peer.username || 'Peer',
          peer.x,
          peer.y - AVATAR_RADIUS - 11
        );

        if (peer.isMuted) {
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(peer.x + AVATAR_RADIUS - 2, peer.y + AVATAR_RADIUS - 2, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '8px monospace';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText('✕', peer.x + AVATAR_RADIUS - 2, peer.y + AVATAR_RADIUS + 1);
        }
      });

      // 15. Sparkle Particle Confetti Bursts
      for (let s = sparkles.current.length - 1; s >= 0; s--) {
        const p = sparkles.current[s];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.022;
        p.vy += 0.04; // gentle gravity

        if (p.alpha <= 0) {
          sparkles.current.splice(s, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 16. Floating Animated Reaction Emojis
      const now = performance.now();
      for (let i = activeReactions.current.length - 1; i >= 0; i--) {
        const item = activeReactions.current[i];
        const age = (now - item.createdAt) / 1000;

        if (age > 2.2) {
          activeReactions.current.splice(i, 1);
          continue;
        }

        const currentY = item.startY - age * 45;
        const currentScale = Math.min(1.2, 0.7 + age * 2);
        const alpha = Math.max(0, 1 - age / 2.2);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `${Math.round(24 * currentScale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(item.emoji, item.x, currentY);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => cancelAnimationFrame(animationFrameId);
  }, [checkCollision, keys, updateAllSpatialAudio, updateCurrentZone, userProfile, isLocalSpeaking, isMuted]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: '100%',
      position: 'relative'
    }}>
      <HUD
        status={connectionStatus}
        participantCount={participantList.length + 1}
        isMicOn={!isMuted}
        onToggleMic={toggleMute}
        isDeafened={isDeafened}
        onToggleDeafen={toggleDeafen}
        currentZone={currentZone}
        roomId={userProfile.roomId}
        fps={fps}
        activePeersInVoice={voicePeerCount}
        onToggleParticipants={() => setIsParticipantsOpen(!isParticipantsOpen)}
        isParticipantsOpen={isParticipantsOpen}
        onToggleRadar={() => setIsRadarOpen(!isRadarOpen)}
        isRadarOpen={isRadarOpen}
        onLeaveRoom={onLeaveRoom}
      />

      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleCanvasClick}
          style={{
            display: 'block',
            backgroundColor: '#070a12',
            borderRadius: '0 0 16px 16px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 40px rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderTop: 'none',
            cursor: 'crosshair'
          }}
        />

        {/* 360-Degree Spatial Radar Mini-Display */}
        <SpatialRadar
          isOpen={isRadarOpen}
          onClose={() => setIsRadarOpen(false)}
          localPositionRef={position}
          peersRef={peers}
          activeVoicePeers={activeVoicePeers.current}
          earshotRadius={DEFAULT_EARSHOT_RADIUS}
        />

        <ParticipantsDrawer
          isOpen={isParticipantsOpen}
          onClose={() => setIsParticipantsOpen(false)}
          self={{
            username: userProfile.username,
            avatarColor: userProfile.avatarColor,
            isMuted,
            isSpeaking: isLocalSpeaking,
            currentZone
          }}
          peers={participantList}
          activeVoicePeers={activeVoicePeers.current}
          onWalkToPeer={handleWalkToPeer}
        />

        <QuickReactions onSendReaction={handleSendReaction} />
      </div>
    </div>
  );
}
