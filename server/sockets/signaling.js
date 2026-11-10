// server/sockets/signaling.js
const PROXIMITY_RADIUS = 100;

// Defined acoustic zones matching the frontend canvas
const ZONES = [
  { id: 'zone-lounge', name: 'Lounge Area', x: 20, y: 20, width: 230, height: 260, isPrivate: true },
  { id: 'zone-conf', name: 'Conference Room', x: 270, y: 20, width: 510, height: 260, isPrivate: true },
  { id: 'zone-work', name: 'Open Workstations', x: 20, y: 300, width: 760, height: 280, isPrivate: false }
];

const players = new Map();

function getZoneForCoordinates(x, y) {
  const zone = ZONES.find(
    (z) => x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height
  );
  return zone || null;
}

function getDistance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Check acoustic reachability: private rooms isolate occupants from outside occupants
function canHearEachOther(p1, p2) {
  const z1 = getZoneForCoordinates(p1.x, p1.y);
  const z2 = getZoneForCoordinates(p2.x, p2.y);

  // If either player is inside a private room, both MUST be in the exact same room
  if (z1?.isPrivate || z2?.isPrivate) {
    if (!z1 || !z2 || z1.id !== z2.id) {
      return false;
    }
  }

  // Within 100px earshot
  return getDistance(p1, p2) <= PROXIMITY_RADIUS;
}

module.exports = function initSignalingEngine(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket Connected] ID: ${socket.id}`);

    socket.on('join-room', ({ roomId, userId, username, initialCoordinates, avatarColor }) => {
      socket.join(roomId);

      const newPlayer = {
        socketId: socket.id,
        userId: userId || `user-${socket.id.substring(0, 5)}`,
        username: username || `Player_${socket.id.substring(0, 4)}`,
        roomId,
        x: initialCoordinates?.x || 400,
        y: initialCoordinates?.y || 400,
        avatarColor: avatarColor || '#2563eb'
      };

      const existingPeers = [];
      players.forEach((p) => {
        if (p.roomId === roomId && p.socketId !== socket.id) {
          existingPeers.push(p);
        }
      });

      players.set(socket.id, newPlayer);

      socket.emit('room-joined', {
        self: newPlayer,
        peers: existingPeers
      });

      socket.to(roomId).emit('player-joined', newPlayer);

      existingPeers.forEach((other) => {
        if (canHearEachOther(newPlayer, other)) {
          socket.emit('peer-entered-proximity', { peerSocketId: other.socketId, isInitiator: true });
          io.to(other.socketId).emit('peer-entered-proximity', { peerSocketId: socket.id, isInitiator: false });
        }
      });
    });

    socket.on('player-move', ({ x, y }) => {
      const player = players.get(socket.id);
      if (!player) return;

      const prevCoords = { x: player.x, y: player.y };
      player.x = x;
      player.y = y;

      socket.to(player.roomId).emit('player-moved', {
        socketId: socket.id,
        x,
        y
      });

      players.forEach((other, otherId) => {
        if (otherId === socket.id || other.roomId !== player.roomId) return;

        const previouslyHeard = canHearEachOther(prevCoords, other);
        const currentlyHeard = canHearEachOther(player, other);

        // Transition: Entered earshot/room boundary
        if (!previouslyHeard && currentlyHeard) {
          socket.emit('peer-entered-proximity', { peerSocketId: other.socketId, isInitiator: true });
          io.to(other.socketId).emit('peer-entered-proximity', { peerSocketId: socket.id, isInitiator: false });
        }
        // Transition: Left earshot or walked outside private room
        else if (previouslyHeard && !currentlyHeard) {
          socket.emit('peer-left-proximity', { peerSocketId: other.socketId });
          io.to(other.socketId).emit('peer-left-proximity', { peerSocketId: socket.id });
        }
      });
    });

    socket.on('webrtc-offer', ({ targetSocketId, offer }) => {
      io.to(targetSocketId).emit('webrtc-offer', {
        senderSocketId: socket.id,
        offer
      });
    });

    socket.on('webrtc-answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('webrtc-answer', {
        senderSocketId: socket.id,
        answer
      });
    });

    socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('webrtc-ice-candidate', {
        senderSocketId: socket.id,
        candidate
      });
    });

    socket.on('voice-activity', ({ isSpeaking }) => {
      const player = players.get(socket.id);
      if (player) {
        socket.to(player.roomId).emit('peer-voice-activity', {
          socketId: socket.id,
          isSpeaking
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket Disconnected] ID: ${socket.id}`);
      const player = players.get(socket.id);
      if (player) {
        socket.to(player.roomId).emit('player-left', { socketId: socket.id });
        players.delete(socket.id);
      }
    });
  });
};