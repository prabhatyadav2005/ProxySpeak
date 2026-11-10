# ProxySpeak — Spatial Audio Virtual Office

ProxySpeak is a high-performance, real-time, proximity-based spatial audio platform that brings natural conversational acoustics to virtual spaces. As participants navigate an interactive 2D office canvas, stereo panning and distance volume attenuation adapt dynamically using the Web Audio API and peer-to-peer WebRTC audio streams.

---

## 🚀 Key Features

- **Proximity-Based Spatial Voice Chat:** Experience natural acoustic falloff—voices become louder as you approach colleagues and fade seamlessly into silence as you move beyond earshot.
- **Dynamic Stereo Panning:** Left/right audio balance accurately reflects the relative position and angle of speaking peers in 2D space.
- **Glassmorphic Cyberpunk Theme:** Polished futuristic UI with dark glassmorphism, Framer Motion animations, live connection monitors, and custom micro-interactions.
- **Interactive 2D Office Canvas:**
  - Multiple zones (Cyber Lounge, Executive Boardroom, Open Engineering Pods).
  - Furniture collision detection (tables, stages, whiteboards).
  - Both keyboard navigation (**WASD / Arrow keys**) and **Click-to-Move** waypoint pathing.
  - Direction indicators and movement vectors for all avatars.
- **Spectacular Visuals & Audio Visualizations:**
  - **Photon Energy Laser Tethers:** Glowing neon green tethers linking peers in earshot with traveling light beads and live equalizer volume badges.
  - **Harmonic Acoustic Shockwaves:** Multi-lobed frequency ripples expanding outward when speaking, linked to microphone volume.
  - **360° Spatial Radar:** Top-down circular cyber radar display with sweeping beam, tracking relative peer bearings and earshot boundaries.
  - **Energy Footstep Trails:** Fading glowing ripples beneath moving avatars.
  - **Auditory Perception Cone:** Subtle holographic forward arc displaying the avatar's hearing orientation.
  - **Sparkle Particle Bursts:** Radial confetti particle explosions when triggering emoji reactions.
- **Live Room & Peer Management:**
  - Animated pre-flight Join Screen with microphone preview meter, color pulse picker, and room selector.
  - Slide-out Participants Drawer with live voice indicators and "Walk to Colleague" shortcut.
  - Floating emoji quick reactions (`👋`, `👍`, `🔥`, `🎉`, `💡`, `❤️`).
- **Resilient Zero-Dependency Architecture:**
  - Automatic in-memory database fallback if MongoDB is not running locally.
  - Automatic Socket.IO reconnection.
  - WebRTC ICE candidate queueing to prevent `InvalidStateError`.
  - Graceful microphone permission handling.

---

## 🛠️ Tech Stack

- **Frontend:** React 18, Vite, Framer Motion, Lucide Icons, HTML5 Canvas
- **Audio Processing:** Web Audio API (`StereoPannerNode`, `GainNode`, `AnalyserNode`), WebRTC (`RTCPeerConnection`)
- **Backend:** Node.js, Express, Socket.IO
- **Database:** MongoDB (via Mongoose) with automatic in-memory fallback
- **Scaling:** Ready for Redis Pub/Sub adapter & Docker Compose

---

## 📂 Project Structure

```
ProxySpeak/
├── client/                      # React + Vite Frontend
│   ├── public/                  # Static assets & favicons
│   ├── src/
│   │   ├── components/
│   │   │   ├── HUD.jsx                  # Top glassmorphic dashboard & telemetry
│   │   │   ├── JoinScreen.jsx           # Animated pre-flight lobby & mic tester
│   │   │   ├── OfficeCanvas.jsx         # 60 FPS spatial audio game canvas
│   │   │   ├── ParticipantsDrawer.jsx   # Slide-out peer directory
│   │   │   ├── QuickReactions.jsx       # Floating emoji reaction bar
│   │   │   └── SpatialRadar.jsx         # 360-degree holographic mini-radar
│   │   ├── hooks/
│   │   │   ├── useKeyboardMovement.js   # Keyboard WASD/Arrow movement listener
│   │   │   └── useWebRTC.js             # Spatial audio Web Audio + WebRTC P2P manager
│   │   ├── App.jsx                      # App root & view orchestrator
│   │   ├── index.css                    # Futuristic dark theme & keyframes
│   │   └── main.jsx                     # Application bootstrap
│   ├── index.html                       # HTML5 entry with Plus Jakarta font
│   ├── package.json
│   ├── vite.config.js                   # Vite config with network host exposed
│   └── Dockerfile                       # Multi-stage production Nginx Dockerfile
├── server/                      # Node.js Signaling & Spatial Engine
│   ├── models/
│   │   ├── RoomLayout.js        # Room layout & furniture schema
│   │   └── UserSession.js       # Player geospatial coordinate schema
│   ├── routes/
│   │   └── rooms.js             # Room layout REST API with in-memory fallback
│   ├── sockets/
│   │   └── signaling.js         # Socket.IO & WebRTC geospatial signaling engine
│   ├── .env                     # Server environment variables
│   ├── .env.example             # Template environment variables
│   ├── Dockerfile               # Node.js Alpine Dockerfile
│   ├── index.js                 # Express server & socket bootstrap
│   └── package.json             # Backend dependencies & scripts
├── docker-compose.yml           # Complete containerized production stack
└── README.md
```

---

## ⚡ Quick Start Instructions

### 1. Start the Backend Server

```bash
cd server
npm install
npm run dev
```

The signaling server boots immediately on `http://localhost:5000`:
- **Health Check:** `http://localhost:5000/health`
- **Room Layouts:** `http://localhost:5000/api/rooms`

*(Note: If MongoDB is offline, the server automatically operates in resilient in-memory mode without any downtime).*

---

### 2. Start the Frontend Client

In a separate terminal:

```bash
cd client
npm install
npm run dev
```

Open your browser to:
- **Local:** `http://localhost:5173`
- **Network (Wi-Fi):** `http://192.168.29.150:5173`

---

### 3. Docker Deployment (Optional 1-Command Setup)

To boot the entire full-stack production application with MongoDB in a single command:

```bash
docker compose up --build
```

---

## 👥 Multi-User Testing (Testing Spatial Audio)

To test spatial audio and proximity voice chat locally:

1. Open `http://localhost:5173` in Browser Window 1 and join as **Player A**.
2. Open `http://localhost:5173` in Browser Window 2 (or an Incognito window) and join as **Player B**.
3. Move the avatars closer to each other on the canvas:
   - When within **130px**, a glowing green **laser tether** connects the avatars with traveling light beads and a live equalizer volume badge.
   - Speak into your microphone to see dynamic animated acoustic shockwaves and hear spatialized audio with stereo panning!
   - Click the **Radar** button in the HUD to view the 360° spatial radar tracking all participants.
