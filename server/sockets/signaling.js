
const UserSession = require('../models/UserSession');

// In-memory coordinate cache
const roomRegistry = new Map();

const PROXIMITY_THRESHOLD_PX = 100;
const DATABASE_UPDATE_INTERVAL = 250;

function getEuclideanDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function calculateVolumeAttenuation(
  distance,
  maxRadius = PROXIMITY_THRESHOLD_PX
) {
  if (distance >= maxRadius) return 0;
  return Math.max(0, Math.min(1, 1 - distance / maxRadius));
}

// Persist player coordinates in MongoDB.
async function persistPlayerLocation(player) {
  if (!player) return;

  try {
    await UserSession.updateOne(
      { socketId: player.socketId },
      {
        $set: {
          location: [player.x, player.y],
          lastActive: new Date(),
          active: true
        }
      }
    );
  } catch (error) {
    console.error('[MongoDB] Location update failed:', error.message);
  }
}

module.exports = function initSignalingEngine(io) {
  io.on('connection', (socket) => {
    socket.currentRoom = null;
    socket.userData = null;

    // 1. Join Room
    socket.on('join-room', async (payload, callback) => {
      try {
        const {
          roomId,
          userId,
          username,
          initialCoordinates,
          avatarColor
        } = payload || {};

        if (!roomId || !userId) {
          if (callback) {
            callback({
              success: false,
              error: 'roomId and userId are required'
            });
          }
          return;
        }

        if (socket.currentRoom) {
          leaveCurrentRoom(socket, io);
        }

        const x = Number(initialCoordinates?.x ?? 200);
        const y = Number(initialCoordinates?.y ?? 200);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          if (callback) {
            callback({
              success: false,
              error: 'Invalid initial coordinates'
            });
          }
          return;
        }

        socket.currentRoom = roomId;
        socket.join(roomId);

        socket.userData = {
          socketId: socket.id,
          userId,
          username: username || `User_${socket.id.substring(0, 4)}`,
          avatarColor: avatarColor || '#3B82F6',
          x,
          y,
          nearbyPeers: new Set(),
          lastPersistAt: Date.now()
        };

        if (!roomRegistry.has(roomId)) {
          roomRegistry.set(roomId, new Map());
        }

        const roomPlayers = roomRegistry.get(roomId);
        roomPlayers.set(socket.id, socket.userData);

        // Save player session in MongoDB.
        await UserSession.findOneAndUpdate(
          { socketId: socket.id },
          {
            $set: {
              socketId: socket.id,
              userId,
              username: socket.userData.username,
              roomId,
              location: [x, y],
              active: true,
              lastActive: new Date()
            }
          },
          {
            upsert: true,
            new: true,
            runValidators: true
          }
        );

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

        console.log(
          `[Room] ${socket.userData.username} joined ${roomId}`
        );

        if (callback) callback({ success: true });

      } catch (error) {
        console.error('[Room] Join error:', error);

        if (socket.currentRoom) {
          leaveCurrentRoom(socket, io);
        }

        if (callback) {
          callback({
            success: false,
            error: error.message
          });
        }
      }
    });

    // 2. Player Movement
    socket.on('player-move', async (coordinates) => {
      const roomId = socket.currentRoom;

      if (!roomId || !socket.userData) return;

      const roomPlayers = roomRegistry.get(roomId);
      if (!roomPlayers) return;

      const { x, y } = coordinates || {};

      if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return;
      }

      // Update in-memory coordinates immediately.
      socket.userData.x = x;
      socket.userData.y = y;

      // Broadcast movement to other players.
      socket.to(roomId).emit('player-moved', {
        socketId: socket.id,
        userId: socket.userData.userId,
        x,
        y
      });

      // Update MongoDB at most once every 250ms per player.
      const now = Date.now();

      if (
        now - socket.userData.lastPersistAt >=
        DATABASE_UPDATE_INTERVAL
      ) {
        socket.userData.lastPersistAt = now;

        await persistPlayerLocation(socket.userData);
      }

      // Update real-time proximity.
      evaluateProximityForPlayer(socket, io);
    });

    // 3. WebRTC Signaling Relays
    socket.on('webrtc-offer', ({ targetSocketId, offer } = {}) => {
      if (
        !targetSocketId ||
        !offer ||
        !socket.currentRoom
      ) return;

      const target = io.sockets.sockets.get(targetSocketId);

      if (target?.currentRoom !== socket.currentRoom) return;

      io.to(targetSocketId).emit('webrtc-offer', {
        senderSocketId: socket.id,
        senderUserId: socket.userData?.userId,
        offer
      });
    });

    socket.on('webrtc-answer', ({ targetSocketId, answer } = {}) => {
      if (
        !targetSocketId ||
        !answer ||
        !socket.currentRoom
      ) return;

      const target = io.sockets.sockets.get(targetSocketId);

      if (target?.currentRoom !== socket.currentRoom) return;

      io.to(targetSocketId).emit('webrtc-answer', {
        senderSocketId: socket.id,
        answer
      });
    });

    socket.on(
      'webrtc-ice-candidate',
      ({ targetSocketId, candidate } = {}) => {
        if (
          !targetSocketId ||
          !candidate ||
          !socket.currentRoom
        ) return;

        const target = io.sockets.sockets.get(targetSocketId);

        if (target?.currentRoom !== socket.currentRoom) return;

        io.to(targetSocketId).emit('webrtc-ice-candidate', {
          senderSocketId: socket.id,
          candidate
        });
      }
    );

    // 4. Cleanup and Disconnect
    socket.on('leave-room', () => {
      leaveCurrentRoom(socket, io);
    });

    socket.on('disconnect', () => {
      leaveCurrentRoom(socket, io);
    });
  });
};

// 5. Proximity Detection
function evaluateProximityForPlayer(socket, io) {
  const roomId = socket.currentRoom;

  if (!roomId) return;

  const roomPlayers = roomRegistry.get(roomId);

  if (!roomPlayers) return;

  const currentPlayer = socket.userData;

  if (!currentPlayer) return;

  for (const [otherSocketId, otherPlayer] of roomPlayers.entries()) {
    if (otherSocketId === socket.id) continue;

    const distance = getEuclideanDistance(
      currentPlayer.x,
      currentPlayer.y,
      otherPlayer.x,
      otherPlayer.y
    );

    const wasInProximity =
      currentPlayer.nearbyPeers.has(otherSocketId);

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
        socket.emit('peer-distance-update', {
          peerSocketId: otherSocketId,
          distance,
          volume
        });

        io.to(otherSocketId).emit('peer-distance-update', {
          peerSocketId: socket.id,
          distance,
          volume
        });
      }

    } else if (wasInProximity) {
      currentPlayer.nearbyPeers.delete(otherSocketId);
      otherPlayer.nearbyPeers.delete(socket.id);

      socket.emit('peer-left-proximity', {
        peerSocketId: otherSocketId,
        peerUserId: otherPlayer.userId
      });

      io.to(otherSocketId).emit('peer-left-proximity', {
        peerSocketId: socket.id,
        peerUserId: currentPlayer.userId
      });
    }
  }
}

// 6. Leave Room and Cleanup
function leaveCurrentRoom(socket, io) {
  const roomId = socket.currentRoom;

  if (!roomId) return;

  const player = socket.userData;
  const roomPlayers = roomRegistry.get(roomId);

  if (player) {
    // Save the latest position before removing the session.
    persistPlayerLocation(player);

    player.nearbyPeers.forEach(peerSocketId => {
      io.to(peerSocketId).emit('peer-left-proximity', {
        peerSocketId: socket.id,
        peerUserId: player.userId
      });
    });
  }

  if (roomPlayers && player) {
    roomPlayers.delete(socket.id);

    if (roomPlayers.size === 0) {
      roomRegistry.delete(roomId);
    }
  }

  socket.to(roomId).emit('player-left', {
    socketId: socket.id,
    userId: player?.userId
  });

  socket.leave(roomId);

  UserSession.deleteOne({ socketId: socket.id }).catch(error => {
    console.error('[MongoDB] Session cleanup failed:', error.message);
  });

  socket.currentRoom = null;
  socket.userData = null;
}
