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

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/proxyspeak';

// =============================================================================
// 1. CORS & MIDDLEWARE CONFIGURATION
// =============================================================================
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json());

// Serve static visual test client if directory exists
app.use(express.static(path.join(__dirname, '../public')));

// =============================================================================
// 2. SOCKET.IO SERVER WITH RESILIENT CORS & RECONNECTION SETTINGS
// =============================================================================
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 10000,
  connectTimeout: 45000
});

// =============================================================================
// 3. OPTIONAL CLUSTER SCALING VIA REDIS PUB/SUB
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

// Initialize WebRTC and Geospatial Signaling Engine
initSignalingEngine(io);

// =============================================================================
// 4. REST ENDPOINTS & ROUTES
// =============================================================================
app.use('/api/rooms', roomsRouter);

// Health check and metrics endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ProxySpeak Signaling & Geospatial Spatial Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    mongoConnected: mongoose.connection.readyState === 1,
    activeConnections: io.engine.clientsCount
  });
});

// Root Route: Server info and dashboard link
app.get('/', (req, res) => {
  if (req.accepts('html')) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ProxySpeak Signaling Server</title>
          <meta http-equiv="refresh" content="2; url=http://localhost:5173" />
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); padding: 36px; border-radius: 16px; border: 1px solid rgba(56, 189, 248, 0.2); text-align: center; max-width: 520px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            h2 { color: #38bdf8; margin-top: 0; font-size: 24px; }
            p { color: #94a3b8; font-size: 15px; line-height: 1.5; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 12px; margin-bottom: 16px; }
            a { display: inline-block; margin-top: 20px; background: linear-gradient(135deg, #2563eb, #38bdf8); color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4); }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">● Server Active</span>
            <h2>ProxySpeak Spatial Audio Engine</h2>
            <p>Signaling & Geospatial Relay running on port ${PORT}. Redirecting to the React Client at http://localhost:5173...</p>
            <a href="http://localhost:5173">Open ProxySpeak Virtual Office</a>
          </div>
        </body>
      </html>
    `);
  }
  res.json({ status: 'running', port: PORT, service: 'ProxySpeak' });
});

// =============================================================================
// 5. SERVER STARTUP & MONGODB CONNECTION
// =============================================================================
server.listen(PORT, () => {
  console.log('========================================================');
  console.log(`  🚀 ProxySpeak Signaling Server Active on port ${PORT}`);
  console.log(`  🌐 Frontend URL:     ${CLIENT_URL}`);
  console.log(`  🩺 Health Check:     http://localhost:${PORT}/health`);
  console.log(`  📦 Room Layout API:  http://localhost:${PORT}/api/rooms`);
  console.log('========================================================');
});

// Connect to MongoDB asynchronously without blocking server operations
mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 2500 })
  .then(() => {
    console.log('[MongoDB] Connected successfully to Database');
  })
  .catch((err) => {
    console.warn('[MongoDB Notice] Running in in-memory mode (MongoDB offline):', err.message);
  });

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    mongoose.connection.close(false).catch(() => {});
    process.exit(0);
  });
});

module.exports = { app, server, io };
