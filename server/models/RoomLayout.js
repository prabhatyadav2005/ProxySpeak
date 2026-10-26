const mongoose = require('mongoose');

/**
 * FurnitureItem Sub-Schema
 * Represents obstacles, tables, audio zones, or interactive items inside a virtual room.
 */
const FurnitureItemSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true
    },
    label: {
      type: String,
      default: 'Object'
    },
    type: {
      type: String,
      enum: ['table', 'chair', 'stage', 'whiteboard', 'speaker_podium', 'partition', 'zone'],
      default: 'table'
    },
    x: {
      type: Number,
      required: true
    },
    y: {
      type: Number,
      required: true
    },
    width: {
      type: Number,
      default: 60
    },
    height: {
      type: Number,
      default: 60
    },
    rotation: {
      type: Number,
      default: 0
    },
    // Optional audio attenuation factor (e.g. walls/partitions dampening sound)
    audioDampeningFactor: {
      type: Number,
      default: 0.0,
      min: 0.0,
      max: 1.0
    }
  },
  { _id: false }
);

/**
 * RoomLayout Schema
 * Member 2 Deliverable (Week 4): Build REST/socket endpoints to store and retrieve room layouts & furniture coordinates
 */
const RoomLayoutSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      default: 'Main Lounge'
    },
    description: {
      type: String,
      default: 'Spatial proximity audio room'
    },
    dimensions: {
      width: {
        type: Number,
        default: 1920
      },
      height: {
        type: Number,
        default: 1080
      }
    },
    defaultSpawnPoint: {
      x: { type: Number, default: 200 },
      y: { type: Number, default: 200 }
    },
    audioSettings: {
      proximityRadius: {
        type: Number,
        default: 100 // 100 pixels threshold for WebRTC audio connect
      },
      maxAudibleDistance: {
        type: Number,
        default: 250 // Max distance before audio falls to zero
      }
    },
    furniture: [FurnitureItemSchema]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('RoomLayout', RoomLayoutSchema);
// [23 Oct 2026] Configured default audio attenuation dampening factors for physical obstacles
