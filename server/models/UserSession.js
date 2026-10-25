const mongoose = require('mongoose');

/**
 * UserSession Schema
 * Member 2 Deliverable: Setup MongoDB schemas using 2D Geospatial indexes (2dsphere)
 * Represents active user presence, location, and room association.
 */
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
    // GeoJSON Point for 2D Geospatial Queries ($near, $geoWithin)
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
        required: true
      },
      coordinates: {
        type: [Number], // [x, y] coordinates in 2D space
        required: true,
        default: [0, 0]
      }
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

// 2D Geospatial Index for high-performance spatial queries
UserSessionSchema.index({ location: '2dsphere' });
UserSessionSchema.index({ roomId: 1, active: 1 });

/**
 * Find peers within proximity radius using MongoDB $near / $maxDistance
 * @param {string} roomId
 * @param {number} x
 * @param {number} y
 * @param {number} maxDistancePixels
 * @param {string} excludeSocketId
 */
UserSessionSchema.statics.findPeersNearby = function (roomId, x, y, maxDistancePixels = 100, excludeSocketId = null) {
  const query = {
    roomId,
    active: true,
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [x, y]
        },
        $maxDistance: maxDistancePixels
      }
    }
  };

  if (excludeSocketId) {
    query.socketId = { $ne: excludeSocketId };
  }

  return this.find(query).lean();
};

module.exports = mongoose.model('UserSession', UserSessionSchema);
// [18 Oct 2026] Optimized geospatial indexing options and added schema validation for coordinates
// [16 Oct 2026] Initialized geospatial schema draft with 2D coordinates for player presence tracking.
