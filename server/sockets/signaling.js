const UserSession = require('../models/UserSession');

// In-memory coordinate cache: Map<roomId, Map<socketId, PlayerState>>
const roomRegistry = new Map();
const PROXIMITY_THRESHOLD_PX = 100;

function getEuclideanDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function calculateVolumeAttenuation(distance, maxRadius = PROXIMITY_THRESHOLD_PX) {
  if (distance >= maxRadius) return 0;
  return Math.max(0, Math.min(1, 1 - distance / maxRadius));
}

module.exports = function initSignalingEngine(io) {
  io.on('connection', (socket) => {
    socket.currentRoom = null;
    socket.userData = null;

    // 1. Join Room
    socket.on('join-room', async (payload, callback) => {
      try {
        const { roomId, userId, username, initialCoordinates, avatarColor } = payload || {};
        if (!roomId || !userId) {
          if (callback) callback({ success: false, error: 'roomId and userId are required' });
          return;
        }

        if (socket.currentRoom && socket.currentRoom !== roomId) {
          leaveCurrentRoom(socket, io);
        }

        socket.currentRoom = roomId;
        socket.join(roomId);

        const x = initialCoordinates?.x ?? Math.floor(Math.random() * 400 + 100);
        const y = initialCoordinates?.y ?? Math.floor(Math.random() * 300 + 100);

        socket.userData = {
          socketId: socket.id,
          userId,
          username: username || `User_${socket.id.substring(0, 4)}`,
          avatarColor: avatarColor || '#3B82F6',
          x,
          y,
          nearbyPeers: new Set()
        };

        if (!roomRegistry.has(roomId)) {
          roomRegistry.set(roomId, new Map());
        }

        const roomPlayers = roomRegistry.get(roomId);
        roomPlayers.set(socket.id, socket.userData);

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

        const existingPeers = [];
        for (const [peerSocketId, peer] of roomPlayers.entries()) {
          if (peerSocketId !== socket.id) {
            existingPeers.push({
              socketId: peer.socketId,
              userId: peer.userId,
              username: peer.username,
              avatarColor: peer.avatarColor,
              x: peer.x,
              y: peer.y
            });
          }
        }

        socket.emit('room-joined', {
          roomId,
          self: {
            socketId: socket.id,
            userId: socket.userData.userId,
            username: socket.userData.username,
            x,
            y
          },
          peers: existingPeers
        });

        socket.to(roomId).emit('player-joined', {
          socketId: socket.id,
          userId: socket.userData.userId,
          username: socket.userData.username,
          avatarColor: socket.userData.avatarColor,
          x,
          y
        });

        evaluateProximityForPlayer(socket, io);

        if (callback) callback({ success: true });
      } catch (err) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 2. Player Movement
    socket.on('player-move', (coordinates) => {
      const roomId = socket.currentRoom;
      if (!roomId || !socket.userData) return;
      const roomPlayers = roomRegistry.get(roomId);
      if (!roomPlayers) return;

      const { x, y } = coordinates || {};
      if (typeof x !== 'number' || typeof y !== 'number') return;

      socket.userData.x = x;
      socket.userData.y = y;

      socket.to(roomId).emit('player-moved', {
        socketId: socket.id,
        userId: socket.userData.userId,
        x,
        y
      });

      evaluateProximityForPlayer(socket, io);
    });

    // 3. WebRTC Signaling Relays
    socket.on('webrtc-offer', ({ targetSocketId, offer }) => {
      if (!targetSocketId || !offer) return;
      io.to(targetSocketId).emit('webrtc-offer', {
        senderSocketId: socket.id,
        senderUserId: socket.userData?.userId,
        offer
      });
    });

    socket.on('webrtc-answer', ({ targetSocketId, answer }) => {
      if (!targetSocketId || !answer) return;
      io.to(targetSocketId).emit('webrtc-answer', {
        senderSocketId: socket.id,
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

    // 4. Cleanup & Disconnect
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

  for (const [otherSocketId, otherPlayer] of roomPlayers.entries()) {
    if (otherSocketId === socket.id) continue;

    const distance = getEuclideanDistance(currentPlayer.x, currentPlayer.y, otherPlayer.x, otherPlayer.y);
    const wasInProximity = currentPlayer.nearbyPeers.has(otherSocketId);

    if (distance <= PROXIMITY_THRESHOLD_PX) {
      const volume = calculateVolumeAttenuation(distance);
      if (!wasInProximity) {
        currentPlayer.nearbyPeers.add(otherSocketId);
        otherPlayer.nearbyPeers.add(socket.id);

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
        socket.emit('peer-distance-update', { peerSocketId: otherSocketId, distance, volume });
        io.to(otherSocketId).emit('peer-distance-update', { peerSocketId: socket.id, distance, volume });
      }
    } else if (distance > PROXIMITY_THRESHOLD_PX && wasInProximity) {
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
    socket.userData.nearbyPeers.forEach((peerSocketId) => {
      io.to(peerSocketId).emit('peer-left-proximity', {
        peerSocketId: socket.id,
        peerUserId: socket.userData.userId
      });
    });
    roomPlayers.delete(socket.id);
    if (roomPlayers.size === 0) roomRegistry.delete(roomId);
  }

  socket.to(roomId).emit('player-left', {
    socketId: socket.id,
    userId: socket.userData?.userId
  });

  socket.leave(roomId);
  UserSession.deleteOne({ socketId: socket.id }).catch(() => {});
  socket.currentRoom = null;
  socket.userData = null;
}