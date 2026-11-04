// server/sockets/signaling.js
const PROXIMITY_RADIUS = 100; // 100px voice earshot threshold

// In-memory session tracking
// Map<socketId, { socketId, userId, username, roomId, x, y, avatarColor }>
const players = new Map();

function getDistance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

module.exports = function initSignalingEngine(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket Connected] ID: ${socket.id}`);

    // 1. Player joins a room
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

      // Retrieve existing players in this room
      const existingPeers = [];
      players.forEach((p) => {
        if (p.roomId === roomId && p.socketId !== socket.id) {
          existingPeers.push(p);
        }
      });

      // Save player to state
      players.set(socket.id, newPlayer);

      // Reply to the joining player with room state
      socket.emit('room-joined', {
        self: newPlayer,
        peers: existingPeers
      });

      // Notify others in the room
      socket.to(roomId).emit('player-joined', newPlayer);

      // Check proximity with existing players in the room
      existingPeers.forEach((other) => {
        const dist = getDistance(newPlayer, other);
        if (dist <= PROXIMITY_RADIUS) {
          // Instruct caller to initiate WebRTC offer
          socket.emit('peer-entered-proximity', { peerSocketId: other.socketId, isInitiator: true });
          io.to(other.socketId).emit('peer-entered-proximity', { peerSocketId: socket.id, isInitiator: false });
        }
      });
    });

    // 2. Player coordinates update & proximity check
    socket.on('player-move', ({ x, y }) => {
      const player = players.get(socket.id);
      if (!player) return;

      const prevX = player.x;
      const prevY = player.y;

      player.x = x;
      player.y = y;

      // Broadcast position to other room members
      socket.to(player.roomId).emit('player-moved', {
        socketId: socket.id,
        x,
        y
      });

      // Re-evaluate proximity thresholds
      players.forEach((other, otherId) => {
        if (otherId === socket.id || other.roomId !== player.roomId) return;

        const oldDist = getDistance({ x: prevX, y: prevY }, other);
        const newDist = getDistance(player, other);

        // Entered 100px range
        if (oldDist > PROXIMITY_RADIUS && newDist <= PROXIMITY_RADIUS) {
          socket.emit('peer-entered-proximity', { peerSocketId: other.socketId, isInitiator: true });
          io.to(other.socketId).emit('peer-entered-proximity', { peerSocketId: socket.id, isInitiator: false });
        }
        // Exited 100px range
        else if (oldDist <= PROXIMITY_RADIUS && newDist > PROXIMITY_RADIUS) {
          socket.emit('peer-left-proximity', { peerSocketId: other.socketId });
          io.to(other.socketId).emit('peer-left-proximity', { peerSocketId: socket.id });
        }
      });
    });

    // 3. WebRTC Signaling Relays
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

    // 4. Handle Disconnect
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