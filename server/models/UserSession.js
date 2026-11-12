
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

    // Canvas pixel coordinates: [x, y]
    // These are NOT longitude/latitude coordinates.
    location: {
      type: [Number],
      required: true,
      default: [200, 200],
      validate: {
        validator: function (value) {
          return (
            Array.isArray(value) &&
            value.length === 2 &&
            value.every(Number.isFinite)
          );
        },
        message: 'Location must contain exactly two numeric coordinates.'
      }
    },

    active: {
      type: Boolean,
      default: true,
      index: true
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

// Normal indexes only. No 2d geospatial index for canvas pixels.
UserSessionSchema.index({ roomId: 1, active: 1, lastActive: 1 });

UserSessionSchema.statics.findPeersNearby = async function (
  roomId,
  x,
  y,
  maxDistancePixels = 100,
  excludeSocketId = null
) {
  const query = {
    roomId,
    active: true
  };

  if (excludeSocketId) {
    query.socketId = { $ne: excludeSocketId };
  }

  const players = await this.find(query).lean();

  return players.filter((player) => {
    const [playerX, playerY] = player.location || [];

    if (
      !Number.isFinite(playerX) ||
      !Number.isFinite(playerY)
    ) {
      return false;
    }

    const distance = Math.hypot(
      playerX - x,
      playerY - y
    );

    return distance <= maxDistancePixels;
  });
};

module.exports = mongoose.model('UserSession', UserSessionSchema);
