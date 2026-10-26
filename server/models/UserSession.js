const mongoose = require('mongoose');

const UserSessionSchema = new mongoose.Schema(
  {
    socketId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    username: {
      type: String,
      required: true,
      default: 'Anonymous User'
    },
    roomId: {
      type: String,
      required: true,
      index: true
    },
    // Stored as [x, y] coordinates in flat 2D canvas space
    location: {
      type: [Number], // [x, y]
      required: true,
      default: [200, 200]
    },
    active: {
      type: Boolean,
      default: true
    },
    lastActive: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Flat 2D Cartesian Index for accurate pixel-distance calculations
UserSessionSchema.index({ location: '2d' });
UserSessionSchema.index({ roomId: 1, active: 1 });
UserSessionSchema.index({ lastActive: 1 }, { expireAfterSeconds: 300 });

/**
 * Find peers within pixel proximity radius using MongoDB $near / $maxDistance
 * @param {string} roomId
 * @param {number} x
 * @param {number} y
 * @param {number} maxDistancePixels
 * @param {string} excludeSocketId
 */
UserSessionSchema.statics.findPeersNearby = function (
  roomId,
  x,
  y,
  maxDistancePixels = 100,
  excludeSocketId = null
) {
  const query = {
    roomId,
    active: true,
    location: {
      $near: [x, y],
      $maxDistance: maxDistancePixels
    }
  };

  if (excludeSocketId) {
    query.socketId = { $ne: excludeSocketId };
  }

  return this.find(query).lean();
};

module.exports = mongoose.model('UserSession', UserSessionSchema);