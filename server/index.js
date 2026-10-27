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

// =============================================================================
// 1. CORS & MIDDLEWARE CONFIGURATION (Week 1 Deliverable)
// =============================================================================
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json());

// Serve static interactive visual test client
app.use(express.static(path.join(__dirname, '../public')));

// =============================================================================
// 2. SOCKET.IO SERVER WITH CORS (Week 1 Deliverable)
// =============================================================================
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false
  },
  pingTimeout: 30000,
  pingInterval: 10000
});

// =============================================================================
// 3. CLUSTER SCALING VIA REDIS PUB/SUB (Week 3 Deliverable)
// Allows horizontal scaling across multiple Node processes
// =============================================================================
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
        console.log(`[Redis Adapter] Connected to redis://${redisHost}:${redisPort} for cluster scaling`);
      })
      .catch((redisErr) => {
        console.warn(`[Redis Adapter] Redis connection failed, falling back to local memory:`, redisErr.message);
      });
  } catch (err) {
    console.warn(`[Redis Adapter] Redis setup skipped:`, err.message);
  }
}

initSignalingEngine(io);


// 4. REST ENDPOINTS & ROUTES (Week 4 Deliverable)

app.use('/api/rooms', roomsRouter);

// Health check and metrics endpoint

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ProxiSpeak Signaling & Geospatial Engine',
    role: 'Member 2 - The Postman',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    mongoConnected: mongoose.connection.readyState === 1
  });
});


// 5. SERVER STARTUP & MONGODB CONNECTION

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/proxispeak';

// Start HTTP & Socket server immediately (zero-wait boot)

server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`  ProxiSpeak Signaling Server Active on port ${PORT}`);
  console.log(`  Visual Radar Client: http://localhost:${PORT}`);
  console.log(`  Health Check:        http://localhost:${PORT}/health`);
  console.log('====================================================');
});

// Connect to MongoDB asynchronously
mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 })
  .then(() => {
    console.log('[MongoDB] Connected successfully to Database');
  })
  .catch((err) => {
    console.warn('[MongoDB Notice] Running in in-memory mode (MongoDB offline):', err.message);
  });

module.exports = { app, server, io };
