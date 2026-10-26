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
      default: 'Anonymous'
    },
    roomId: {
      type: String,
      required: true,
      index: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
        required: true
      },
      coordinates: {
        type: [Number],
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

UserSessionSchema.index({ location: '2dsphere' });
UserSessionSchema.index({ roomId: 1, active: 1 });

UserSessionSchema.statics.findPeersNearby = function (roomId, x, y, maxDistance = 100, excludeSocketId = null) {
  const query = {
    roomId,
    active: true,
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [x, y]
        },
        $maxDistance: maxDistance
      }
    }
  };

  if (excludeSocketId) {
    query.socketId = { $ne: excludeSocketId };
  }

  return this.find(query).lean();
};

module.exports = mongoose.model('UserSession', UserSessionSchema);
