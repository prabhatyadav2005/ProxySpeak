const mongoose = require('mongoose');
const UserSession = require('../models/UserSession');

// In-memory coordinate and player state cache: Map<roomId, Map<socketId, PlayerState>>
const roomRegistry = new Map();
const DEFAULT_PROXIMITY_THRESHOLD_PX = 130;

function getEuclideanDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function calculateVolumeAttenuation(distance, maxRadius = DEFAULT_PROXIMITY_THRESHOLD_PX) {
  if (distance >= maxRadius) return 0;
  // Natural cubic-like falloff for spatial realism
  const normalized = Math.max(0, Math.min(1, 1 - distance / maxRadius));
  return Math.round(normalized * 100) / 100;
}

module.exports = function initSignalingEngine(io) {
  io.on('connection', (socket) => {
    socket.currentRoom = null;
    socket.userData = null;

    // Send server acknowledgement on connection
    socket.emit('server-ready', {
      socketId: socket.id,
      timestamp: Date.now()
    });

    // 1. Join Room
    socket.on('join-room', async (payload, callback) => {
      try {
        const { roomId = 'main-office', userId, username, initialCoordinates, avatarColor, isMuted = false } = payload || {};
        if (!userId) {
          if (callback) callback({ success: false, error: 'userId is required' });
          return;
        }

        // Leave existing room if any
        if (socket.currentRoom && socket.currentRoom !== roomId) {
          leaveCurrentRoom(socket, io);
        }

        socket.currentRoom = roomId;
        socket.join(roomId);

        const x = initialCoordinates?.x ?? Math.floor(Math.random() * 400 + 200);
        const y = initialCoordinates?.y ?? Math.floor(Math.random() * 300 + 200);

        socket.userData = {
          socketId: socket.id,
          userId,
          username: username || `User_${socket.id.substring(0, 4)}`,
          avatarColor: avatarColor || '#38bdf8',
          x,
          y,
          direction: 'down',
          isMuted: Boolean(isMuted),
          isSpeaking: false,
          audioLevel: 0,
          currentZone: 'Open Space',
          proximityRadius: DEFAULT_PROXIMITY_THRESHOLD_PX,
          nearbyPeers: new Set()
        };

        if (!roomRegistry.has(roomId)) {
          roomRegistry.set(roomId, new Map());
        }

        const roomPlayers = roomRegistry.get(roomId);
        roomPlayers.set(socket.id, socket.userData);

        // Safe MongoDB session update if connected
        if (mongoose.connection && mongoose.connection.readyState === 1) {
          UserSession.findOneAndUpdate(
            { socketId: socket.id },
            {
              socketId: socket.id,
              userId,
              username: socket.userData.username,
              roomId,
              location: [x, y],
              active: true,
              lastActive: new Date()
            },
            { upsert: true, new: true }
          ).catch(() => {});
        }

        // Collect existing peers in the room
        const existingPeers = [];
        for (const [peerSocketId, peer] of roomPlayers.entries()) {
          if (peerSocketId !== socket.id) {
            existingPeers.push({
              socketId: peer.socketId,
              userId: peer.userId,
              username: peer.username,
              avatarColor: peer.avatarColor,
              x: peer.x,
              y: peer.y,
              direction: peer.direction,
              isMuted: peer.isMuted,
              isSpeaking: peer.isSpeaking,
              audioLevel: peer.audioLevel,
              currentZone: peer.currentZone
            });
          }
        }

        // Acknowledge to joining client
        socket.emit('room-joined', {
          roomId,
          self: {
            socketId: socket.id,
            userId: socket.userData.userId,
            username: socket.userData.username,
            avatarColor: socket.userData.avatarColor,
            x,
            y,
            direction: socket.userData.direction,
            proximityRadius: socket.userData.proximityRadius
          },
          peers: existingPeers
        });

        // Broadcast new user to all other room peers
        socket.to(roomId).emit('player-joined', {
          socketId: socket.id,
          userId: socket.userData.userId,
          username: socket.userData.username,
          avatarColor: socket.userData.avatarColor,
          x,
          y,
          direction: socket.userData.direction,
          isMuted: socket.userData.isMuted,
          isSpeaking: false,
          audioLevel: 0
        });

        // Trigger immediate proximity calculation for initial positioning
        evaluateProximityForPlayer(socket, io);

        if (callback) callback({ success: true, count: roomPlayers.size });
      } catch (err) {
        console.error('[Signaling Error] join-room:', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 2. Player Movement
    socket.on('player-move', (data) => {
      const roomId = socket.currentRoom;
      if (!roomId || !socket.userData) return;
      const roomPlayers = roomRegistry.get(roomId);
      if (!roomPlayers) return;

      const { x, y, direction, currentZone } = data || {};
      if (typeof x !== 'number' || typeof y !== 'number') return;

      socket.userData.x = x;
      socket.userData.y = y;
      if (direction) socket.userData.direction = direction;
      if (currentZone) socket.userData.currentZone = currentZone;

      // Broadcast move event with direction
      socket.to(roomId).emit('player-moved', {
        socketId: socket.id,
        userId: socket.userData.userId,
        x,
        y,
        direction: socket.userData.direction,
        currentZone: socket.userData.currentZone
      });

      evaluateProximityForPlayer(socket, io);
    });

    // 3. Voice Activity & Speaking Indicators
    socket.on('user-speaking', ({ isSpeaking, audioLevel = 0 }) => {
      const roomId = socket.currentRoom;
      if (!roomId || !socket.userData) return;

      socket.userData.isSpeaking = Boolean(isSpeaking);
      socket.userData.audioLevel = audioLevel;

      socket.to(roomId).emit('user-speaking-update', {
        socketId: socket.id,
        isSpeaking: socket.userData.isSpeaking,
        audioLevel: socket.userData.audioLevel
      });
    });

    // 4. Mute / Unmute Status
    socket.on('user-mute-status', ({ isMuted }) => {
      const roomId = socket.currentRoom;
      if (!roomId || !socket.userData) return;

      socket.userData.isMuted = Boolean(isMuted);

      socket.to(roomId).emit('user-mute-update', {
        socketId: socket.id,
        isMuted: socket.userData.isMuted
      });
    });

    // 5. Floating Reactions / Emotes
    socket.on('send-reaction', ({ emoji }) => {
      const roomId = socket.currentRoom;
      if (!roomId || !socket.userData || !emoji) return;

      io.to(roomId).emit('peer-reaction', {
        socketId: socket.id,
        emoji,
        id: `${socket.id}-${Date.now()}`
      });
    });

    // 6. WebRTC Signaling Relays with Validation
    socket.on('webrtc-offer', ({ targetSocketId, offer }) => {
      if (!targetSocketId || !offer) return;
      io.to(targetSocketId).emit('webrtc-offer', {
        senderSocketId: socket.id,
        senderUserId: socket.userData?.userId,
        senderUsername: socket.userData?.username,
        offer
      });
    });

    socket.on('webrtc-answer', ({ targetSocketId, answer }) => {
      if (!targetSocketId || !answer) return;
      io.to(targetSocketId).emit('webrtc-answer', {
        senderSocketId: socket.id,
        senderUserId: socket.userData?.userId,
        answer
      });
    });

    socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
      if (!targetSocketId || !candidate) return;
      io.to(targetSocketId).emit('webrtc-ice-candidate', {
        senderSocketId: socket.id,
        candidate
      });
    });

    // 7. Room Info Query
    socket.on('get-room-info', (callback) => {
      const roomId = socket.currentRoom;
      if (!roomId || !roomRegistry.has(roomId)) {
        if (callback) callback({ success: false, count: 0, peers: [] });
        return;
      }
      const roomPlayers = roomRegistry.get(roomId);
      const list = Array.from(roomPlayers.values()).map(p => ({
        socketId: p.socketId,
        username: p.username,
        avatarColor: p.avatarColor,
        isMuted: p.isMuted,
        isSpeaking: p.isSpeaking,
        currentZone: p.currentZone
      }));
      if (callback) callback({ success: true, count: list.length, peers: list });
    });

    // 8. Cleanup & Disconnection
    socket.on('leave-room', () => leaveCurrentRoom(socket, io));
    socket.on('disconnect', () => leaveCurrentRoom(socket, io));
  });
};

function evaluateProximityForPlayer(socket, io) {
  const roomId = socket.currentRoom;
  if (!roomId) return;
  const roomPlayers = roomRegistry.get(roomId);
  if (!roomPlayers) return;
  const currentPlayer = socket.userData;
  if (!currentPlayer) return;

  const threshold = currentPlayer.proximityRadius || DEFAULT_PROXIMITY_THRESHOLD_PX;

  for (const [otherSocketId, otherPlayer] of roomPlayers.entries()) {
    if (otherSocketId === socket.id) continue;

    const distance = getEuclideanDistance(currentPlayer.x, currentPlayer.y, otherPlayer.x, otherPlayer.y);
    const wasInProximity = currentPlayer.nearbyPeers.has(otherSocketId);

    if (distance <= threshold) {
      const volume = calculateVolumeAttenuation(distance, threshold);

      if (!wasInProximity) {
        currentPlayer.nearbyPeers.add(otherSocketId);
        otherPlayer.nearbyPeers.add(socket.id);

        // Notify both peers that they entered audio proximity
        socket.emit('peer-entered-proximity', {
          peerSocketId: otherSocketId,
          peerUserId: otherPlayer.userId,
          distance,
          volume,
          isInitiator: true
        });

        io.to(otherSocketId).emit('peer-entered-proximity', {
          peerSocketId: socket.id,
          peerUserId: currentPlayer.userId,
          distance,
          volume,
          isInitiator: false
        });
      } else {
        // Continuous distance update for dynamic stereo panning and volume falloff
        socket.emit('peer-distance-update', { peerSocketId: otherSocketId, distance, volume });
        io.to(otherSocketId).emit('peer-distance-update', { peerSocketId: socket.id, distance, volume });
      }
    } else if (distance > threshold && wasInProximity) {
      currentPlayer.nearbyPeers.delete(otherSocketId);
      otherPlayer.nearbyPeers.delete(socket.id);

      socket.emit('peer-left-proximity', { peerSocketId: otherSocketId, peerUserId: otherPlayer.userId });
      io.to(otherSocketId).emit('peer-left-proximity', { peerSocketId: socket.id, peerUserId: currentPlayer.userId });
    }
  }
}

function leaveCurrentRoom(socket, io) {
  const roomId = socket.currentRoom;
  if (!roomId) return;

  const roomPlayers = roomRegistry.get(roomId);
  if (roomPlayers && socket.userData) {
    // Notify all nearby peers that proximity closed
    socket.userData.nearbyPeers.forEach((peerSocketId) => {
      io.to(peerSocketId).emit('peer-left-proximity', {
        peerSocketId: socket.id,
        peerUserId: socket.userData.userId
      });
      const peer = roomPlayers.get(peerSocketId);
      if (peer) {
        peer.nearbyPeers.delete(socket.id);
      }
    });

    roomPlayers.delete(socket.id);
    if (roomPlayers.size === 0) {
      roomRegistry.delete(roomId);
    }
  }

  // Broadcast player-left to room
  socket.to(roomId).emit('player-left', {
    socketId: socket.id,
    userId: socket.userData?.userId
  });

  socket.leave(roomId);

  if (mongoose.connection && mongoose.connection.readyState === 1) {
    UserSession.deleteOne({ socketId: socket.id }).catch(() => {});
  }

  socket.currentRoom = null;
  socket.userData = null;
}
