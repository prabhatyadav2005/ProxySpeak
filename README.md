# ProxySpeak

ProxySpeak is a real-time, proximity-based spatial audio platform that brings natural conversational dynamics to virtual spaces. As participants navigate a 2D canvas, audio volume and stereo panning adjust dynamically depending on proximity and orientation relative to other users.

## 🚀 Key Features

- **Proximity-Based Voice Chat:** Experience natural falloff—hear users louder as you walk closer and softer as you walk away.
- **Directional Audio:** Panning reflects the relative direction of speakers in the 2D space.
- **Interactive 2D Canvas:** Move your avatar freely across an interactive map to form dynamic conversational circles.
- **Low-Latency Streaming:** Direct peer-to-peer audio transmission for responsive real-time conversations.

## 🛠️ Tech Stack

- **Frontend:** React, HTML5 Canvas
- **Audio Processing:** Web Audio API, WebRTC
- **Signaling & State Sync:** Node.js, Express, Socket.io
- **Language:** JavaScript

## 📁 Architecture Overview

- **Signaling Server:** Relays coordinate updates, joins/leaves, and handles WebRTC SDP/ICE candidate exchange.
- **Audio Pipeline:** Streams peer audio through Web Audio gain and panner nodes to apply real-time spatial attenuation.
- **Canvas World:** Renders real-time avatar positions, direction vectors, and auditory reach zones.

---

## 📡 Backend Signaling & Proximity Server

The backend infrastructure manages real-time spatial coordinates, 100px proximity calculations, and WebRTC signaling routing.

### Components
- `server/index.js` - Express and Socket.io server with CORS and Redis adapter support.
- `server/sockets/signaling.js` - Real-time coordinate synchronization, proximity detection, and WebRTC SDP/ICE relay.
- `server/models/UserSession.js` - MongoDB user session schema with 2dsphere geospatial indexing.
- `server/models/RoomLayout.js` - Room layout and furniture coordinate schema.
- `server/routes/rooms.js` - REST endpoints for room layouts.

### Running Locally

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start server
npm start
```
