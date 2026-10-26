require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const initSignalingEngine = require('./sockets/signaling');
const roomsRouter = require('./routes/rooms');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Socket.io initialization
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 10000
});

// Redis adapter for horizontal scaling
if (process.env.USE_REDIS === 'true') {
  try {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');

    const redisHost = process.env.REDIS_HOST || '127.0.0.1';
    const redisPort = process.env.REDIS_PORT || 6379;
    const pubClient = createClient({ url: `redis://${redisHost}:${redisPort}` });
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log(`[Redis] Pub/Sub adapter connected: ${redisHost}:${redisPort}`);
      })
      .catch((err) => {
        console.warn('[Redis] Connection failed, falling back to memory adapter:', err.message);
      });
  } catch (err) {
    console.warn('[Redis] Setup skipped:', err.message);
  }
}

// Socket signaling handlers
initSignalingEngine(io);

// API routes
app.use('/api/rooms', roomsRouter);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/proxispeak';

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 })
  .then(() => {
    console.log('[MongoDB] Connected to database');
  })
  .catch((err) => {
    console.warn('[MongoDB] Connection failed, running in-memory:', err.message);
  });

module.exports = { app, server, io };
