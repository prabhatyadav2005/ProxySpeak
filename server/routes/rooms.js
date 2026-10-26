const express = require('express');
const router = express.Router();
const RoomLayout = require('../models/RoomLayout');

/**
 * Member 2 Deliverable (Week 4):
 * REST endpoints to store and retrieve room layouts and furniture coordinates.
 */

// GET /api/rooms/:roomId/layout - Fetch room configuration and furniture
router.get('/:roomId/layout', async (req, res) => {
  try {
    const { roomId } = req.params;
    let layout = await RoomLayout.findOne({ roomId });

    if (!layout) {
      // Create a default starter layout if none exists
      layout = await RoomLayout.create({
        roomId,
        name: `Room ${roomId}`,
        dimensions: { width: 1920, height: 1080 },
        defaultSpawnPoint: { x: 300, y: 300 },
        furniture: [
          { id: 'f-1', label: 'Discussion Table', type: 'table', x: 500, y: 400, width: 140, height: 80 },
          { id: 'f-2', label: 'Whiteboard', type: 'whiteboard', x: 200, y: 100, width: 200, height: 20 },
          { id: 'f-3', label: 'Presentation Stage', type: 'stage', x: 800, y: 200, width: 250, height: 120 }
        ]
      });
    }

    res.json({
      success: true,
      layout
    });
  } catch (err) {
    console.error('[REST Error] GET /api/rooms/:roomId/layout:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/rooms/:roomId/layout - Save or update room layout and furniture coordinates
router.post('/:roomId/layout', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name, description, dimensions, defaultSpawnPoint, audioSettings, furniture } = req.body;

    const updatedLayout = await RoomLayout.findOneAndUpdate(
      { roomId },
      {
        roomId,
        ...(name && { name }),
        ...(description && { description }),
        ...(dimensions && { dimensions }),
        ...(defaultSpawnPoint && { defaultSpawnPoint }),
        ...(audioSettings && { audioSettings }),
        ...(furniture && { furniture })
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Room layout saved successfully',
      layout: updatedLayout
    });
  } catch (err) {
    console.error('[REST Error] POST /api/rooms/:roomId/layout:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/rooms - List all available rooms
router.get('/', async (req, res) => {
  try {
    const rooms = await RoomLayout.find({}, 'roomId name dimensions createdAt').lean();
    res.json({ success: true, count: rooms.length, rooms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;