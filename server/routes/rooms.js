const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const RoomLayout = require('../models/RoomLayout');

// In-Memory Storage Fallback (active when MongoDB is offline)
const inMemoryRooms = new Map();

// Default starter rooms
const DEFAULT_ROOMS = {
  'main-office': {
    roomId: 'main-office',
    name: 'Proxy HQ - Main Office',
    description: 'Central collaborative workspace with open workstations, conference room, and lounge area.',
    dimensions: { width: 900, height: 650 },
    defaultSpawnPoint: { x: 450, y: 480 },
    audioSettings: {
      proximityRadius: 130,
      maxAudibleDistance: 240
    },
    zones: [
      { id: 'zone-lounge', name: 'Cyber Lounge', x: 25, y: 25, width: 250, height: 260, color: 'rgba(56, 189, 248, 0.08)', border: '#0284c7' },
      { id: 'zone-conf', name: 'Executive Conference Room', x: 300, y: 25, width: 575, height: 260, color: 'rgba(168, 85, 247, 0.08)', border: '#9333ea' },
      { id: 'zone-work', name: 'Open Engineering Pods', x: 25, y: 310, width: 850, height: 315, color: 'rgba(34, 197, 94, 0.08)', border: '#16a34a' }
    ],
    furniture: [
      { id: 'f-1', label: 'Oval Board Table', type: 'table', x: 500, y: 110, width: 170, height: 90, audioDampeningFactor: 0.1 },
      { id: 'f-2', label: 'Digital Whiteboard', type: 'whiteboard', x: 320, y: 40, width: 140, height: 22, audioDampeningFactor: 0.2 },
      { id: 'f-3', label: 'Keynote Stage', type: 'stage', x: 45, y: 45, width: 150, height: 95, audioDampeningFactor: 0.0 },
      { id: 'f-4', label: 'Coffee & Refreshments', type: 'table', x: 50, y: 195, width: 90, height: 65, audioDampeningFactor: 0.05 },
      { id: 'f-5', label: 'Dev Desk Island Alpha', type: 'table', x: 120, y: 370, width: 220, height: 80, audioDampeningFactor: 0.15 },
      { id: 'f-6', label: 'Dev Desk Island Beta', type: 'table', x: 520, y: 370, width: 220, height: 80, audioDampeningFactor: 0.15 }
    ]
  },
  'cyber-lounge': {
    roomId: 'cyber-lounge',
    name: 'Cyberpunk Chill Lounge',
    description: 'Casual networking lounge with ambient music zones and private meeting booths.',
    dimensions: { width: 900, height: 650 },
    defaultSpawnPoint: { x: 450, y: 320 },
    audioSettings: {
      proximityRadius: 110,
      maxAudibleDistance: 200
    },
    zones: [
      { id: 'zone-dj', name: 'Audio Stage & DJ Pod', x: 25, y: 25, width: 280, height: 260, color: 'rgba(236, 72, 153, 0.08)', border: '#db2777' },
      { id: 'zone-bar', name: 'Neon Bar & Taproom', x: 330, y: 25, width: 545, height: 260, color: 'rgba(245, 158, 11, 0.08)', border: '#d97706' },
      { id: 'zone-booths', name: 'Private Acoustic Booths', x: 25, y: 310, width: 850, height: 315, color: 'rgba(99, 102, 241, 0.08)', border: '#4f46e5' }
    ],
    furniture: [
      { id: 'cf-1', label: 'Holographic DJ Console', type: 'stage', x: 60, y: 80, width: 190, height: 110, audioDampeningFactor: 0.0 },
      { id: 'cf-2', label: 'Neon Bar Counter', type: 'table', x: 420, y: 90, width: 340, height: 60, audioDampeningFactor: 0.2 },
      { id: 'cf-3', label: 'Acoustic Pod Alpha', type: 'zone', x: 60, y: 390, width: 180, height: 160, audioDampeningFactor: 0.5 },
      { id: 'cf-4', label: 'Acoustic Pod Beta', type: 'zone', x: 360, y: 390, width: 180, height: 160, audioDampeningFactor: 0.5 },
      { id: 'cf-5', label: 'Acoustic Pod Gamma', type: 'zone', x: 650, y: 390, width: 180, height: 160, audioDampeningFactor: 0.5 }
    ]
  }
};

// Seed default rooms in memory
Object.entries(DEFAULT_ROOMS).forEach(([id, room]) => {
  inMemoryRooms.set(id, room);
});

const isMongoActive = () => mongoose.connection && mongoose.connection.readyState === 1;

// GET /api/rooms - List all rooms
router.get('/', async (req, res) => {
  try {
    if (isMongoActive()) {
      const dbRooms = await RoomLayout.find({}, 'roomId name description dimensions defaultSpawnPoint audioSettings').lean();
      if (dbRooms && dbRooms.length > 0) {
        return res.json({ success: true, count: dbRooms.length, rooms: dbRooms });
      }
    }

    const rooms = Array.from(inMemoryRooms.values()).map(r => ({
      roomId: r.roomId,
      name: r.name,
      description: r.description,
      dimensions: r.dimensions,
      defaultSpawnPoint: r.defaultSpawnPoint,
      audioSettings: r.audioSettings
    }));

    return res.json({ success: true, count: rooms.length, rooms });
  } catch (err) {
    console.error('[REST Error] GET /api/rooms:', err.message);
    const fallbackRooms = Array.from(inMemoryRooms.values());
    res.json({ success: true, count: fallbackRooms.length, rooms: fallbackRooms });
  }
});

// GET /api/rooms/:roomId/layout - Fetch room configuration, zones, and furniture
router.get('/:roomId/layout', async (req, res) => {
  try {
    const { roomId } = req.params;

    if (isMongoActive()) {
      let layout = await RoomLayout.findOne({ roomId });
      if (layout) {
        return res.json({ success: true, layout });
      }
    }

    // Check memory store
    if (inMemoryRooms.has(roomId)) {
      return res.json({ success: true, layout: inMemoryRooms.get(roomId) });
    }

    // Dynamic fallback generation for unknown rooms
    const generatedLayout = {
      roomId,
      name: `Space: ${roomId}`,
      description: 'Dynamic spatial audio virtual workspace',
      dimensions: { width: 900, height: 650 },
      defaultSpawnPoint: { x: 450, y: 325 },
      audioSettings: {
        proximityRadius: 130,
        maxAudibleDistance: 240
      },
      zones: [
        { id: `zone-${roomId}-1`, name: 'Collaborative Hub', x: 25, y: 25, width: 850, height: 600, color: 'rgba(56, 189, 248, 0.05)', border: '#0284c7' }
      ],
      furniture: [
        { id: 'dyn-1', label: 'Main Roundtable', type: 'table', x: 380, y: 260, width: 140, height: 80, audioDampeningFactor: 0.1 }
      ]
    };

    inMemoryRooms.set(roomId, generatedLayout);
    res.json({ success: true, layout: generatedLayout });
  } catch (err) {
    console.error(`[REST Error] GET /api/rooms/${req.params.roomId}/layout:`, err.message);
    const fallback = inMemoryRooms.get(req.params.roomId) || DEFAULT_ROOMS['main-office'];
    res.json({ success: true, layout: fallback });
  }
});

// POST /api/rooms/:roomId/layout - Save or update room layout
router.post('/:roomId/layout', async (req, res) => {
  try {
    const { roomId } = req.params;
    const body = req.body || {};

    const updated = {
      roomId,
      name: body.name || `Room ${roomId}`,
      description: body.description || '',
      dimensions: body.dimensions || { width: 900, height: 650 },
      defaultSpawnPoint: body.defaultSpawnPoint || { x: 450, y: 325 },
      audioSettings: body.audioSettings || { proximityRadius: 130, maxAudibleDistance: 240 },
      zones: body.zones || [],
      furniture: body.furniture || []
    };

    inMemoryRooms.set(roomId, updated);

    if (isMongoActive()) {
      await RoomLayout.findOneAndUpdate(
        { roomId },
        updated,
        { upsert: true, new: true, runValidators: true }
      ).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Room layout saved successfully',
      layout: updated
    });
  } catch (err) {
    console.error('[REST Error] POST /api/rooms/:roomId/layout:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.inMemoryRooms = inMemoryRooms;
