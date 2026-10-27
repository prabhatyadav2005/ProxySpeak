const express = require('express');
const router = express.Router();
const RoomLayout = require('../models/RoomLayout');

// Get room configuration and furniture
router.get('/:roomId/layout', async (req, res) => {
  try {
    const { roomId } = req.params;
    let layout = await RoomLayout.findOne({ roomId });

    if (!layout) {
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
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save or update room layout
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
      layout: updatedLayout
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete or reset room layout
router.delete('/:roomId/layout', async (req, res) => {
  try {
    const { roomId } = req.params;
    await RoomLayout.deleteOne({ roomId });
    res.json({ success: true, message: `Room ${roomId} layout reset to default` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List rooms
router.get('/', async (req, res) => {
  try {
    const rooms = await RoomLayout.find({}, 'roomId name dimensions createdAt').lean();
    res.json({ success: true, count: rooms.length, rooms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
