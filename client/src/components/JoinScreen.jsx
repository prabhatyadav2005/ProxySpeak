import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, Sparkles, Radio, Users, Compass, Shield, ArrowRight, RefreshCw } from 'lucide-react';

const RANDOM_NAMES = [
  'CyberNomad', 'PixelPilot', 'NovaStrider', 'QuantumCoder', 
  'EchoPulse', 'VectorGhost', 'AstroVibe', 'SolarNexus', 'HyperByte'
];

const AVATAR_COLORS = [
  { label: 'Cyber Cyan', hex: '#38bdf8', glow: 'rgba(56, 189, 248, 0.4)' },
  { label: 'Neon Emerald', hex: '#10b981', glow: 'rgba(16, 185, 129, 0.4)' },
  { label: 'Ultraviolet', hex: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)' },
  { label: 'Solar Amber', hex: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' },
  { label: 'Hyper Rose', hex: '#f43f5e', glow: 'rgba(244, 63, 94, 0.4)' },
  { label: 'Electric Indigo', hex: '#6366f1', glow: 'rgba(99, 102, 241, 0.4)' }
];

const PRESET_ROOMS = [
  {
    id: 'main-office',
    name: 'Proxy HQ - Main Office',
    desc: 'Lounge, Executive Conference Room & Open Engineering Pods',
    tag: 'Recommended'
  },
  {
    id: 'cyber-lounge',
    name: 'Cyberpunk Chill Lounge',
    desc: 'Audio stage, ambient neon bar & private acoustic booths',
    tag: 'Casual'
  }
];

export default function JoinScreen({ onJoin, initialRoomId = 'main-office' }) {
  const [username, setUsername] = useState(() => {
    return sessionStorage.getItem('proxyspeak_username') || 
      RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  });
  const [selectedColor, setSelectedColor] = useState(() => {
    return sessionStorage.getItem('proxyspeak_color') || AVATAR_COLORS[0].hex;
  });
  const [roomId, setRoomId] = useState(initialRoomId);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [micTesting, setMicTesting] = useState(false);
  const [micVolume, setMicVolume] = useState(0);

  // Quick randomize username
  const handleRandomizeName = () => {
    const random = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    const suffix = Math.floor(Math.random() * 90 + 10);
    setUsername(`${random}_${suffix}`);
  };

  // Test microphone input in preview
  useEffect(() => {
    let audioContext;
    let stream;
    let animId;

    async function startMicMeter() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setMicTesting(true);
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length / 255;
          setMicVolume(Math.min(100, Math.round(avg * 140)));
          animId = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        setMicTesting(false);
      }
    }

    if (!isMicMuted) {
      startMicMeter();
    } else {
      setMicVolume(0);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
    };
  }, [isMicMuted]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    sessionStorage.setItem('proxyspeak_username', username.trim());
    sessionStorage.setItem('proxyspeak_color', selectedColor);

    onJoin({
      username: username.trim(),
      avatarColor: selectedColor,
      roomId: roomId.trim() || 'main-office',
      isMuted: isMicMuted
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      background: 'radial-gradient(ellipse at 50% 20%, #0f172a 0%, #07090e 70%)',
      padding: '24px',
      overflow: 'hidden'
    }}>
      {/* Ambient Cyber Grid Background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(to right, rgba(56, 189, 248, 0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(56, 189, 248, 0.05) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 80%)',
        pointerEvents: 'none'
      }} />

      {/* Floating Ambient Glow Orbs */}
      <motion.div
        animate={{
          x: [0, 30, -30, 0],
          y: [0, -40, 20, 0],
          scale: [1, 1.15, 0.9, 1]
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: '15%',
          left: '20%',
          width: '320px',
          height: '320px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%)',
          filter: 'blur(40px)',
          pointerEvents: 'none'
        }}
      />
      <motion.div
        animate={{
          x: [0, -40, 25, 0],
          y: [0, 30, -30, 0],
          scale: [1, 0.9, 1.15, 1]
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          bottom: '15%',
          right: '20%',
          width: '360px',
          height: '360px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, transparent 70%)',
          filter: 'blur(50px)',
          pointerEvents: 'none'
        }}
      />

      {/* Main Glassmorphic Card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '520px',
          position: 'relative',
          zIndex: 10,
          padding: '36px',
          border: '1px solid rgba(56, 189, 248, 0.25)'
        }}
      >
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 14px',
            borderRadius: '9999px',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            marginBottom: '14px'
          }}>
            <Radio size={14} color="#38bdf8" />
            <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', color: '#38bdf8', textTransform: 'uppercase' }}>
              Spatial Audio Virtual Office
            </span>
          </div>

          <h1 style={{
            fontSize: '32px',
            fontWeight: '800',
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: '0 0 8px 0'
          }}>
            Proxy<span style={{ color: '#38bdf8', WebkitTextFillColor: '#38bdf8' }}>Speak</span>
          </h1>

          <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
            Proximity-based acoustics, stereo panning, and real-time avatars in an interactive workspace.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Avatar Preview & Name Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <motion.div
              whileHover={{ scale: 1.08 }}
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: selectedColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: '800',
                fontSize: '22px',
                boxShadow: `0 0 25px ${selectedColor}66`,
                border: '3px solid #ffffff',
                flexShrink: 0,
                position: 'relative'
              }}
            >
              {username ? username.charAt(0).toUpperCase() : 'U'}
              {/* Subtle pulsing ring */}
              <div style={{
                position: 'absolute',
                inset: -6,
                borderRadius: '50%',
                border: `1.5px dashed ${selectedColor}`,
                opacity: 0.7
              }} />
            </motion.div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#cbd5e1' }}>
                  Callsign / Display Name
                </label>
                <button
                  type="button"
                  onClick={handleRandomizeName}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <RefreshCw size={11} /> Randomize
                </button>
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your name..."
                required
                maxLength={24}
                className="glass-input"
              />
            </div>
          </div>

          {/* Avatar Color Picker */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '8px' }}>
              Avatar Color Pulse
            </label>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
              {AVATAR_COLORS.map((col) => {
                const isSelected = selectedColor === col.hex;
                return (
                  <motion.button
                    key={col.hex}
                    type="button"
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedColor(col.hex)}
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      backgroundColor: col.hex,
                      border: isSelected ? '2px solid #ffffff' : '2px solid transparent',
                      boxShadow: isSelected ? `0 0 16px ${col.hex}` : 'none',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'all 0.2s ease'
                    }}
                    title={col.label}
                  />
                );
              })}
            </div>
          </div>

          {/* Room Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '8px' }}>
              Target Room / Virtual Zone
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              {PRESET_ROOMS.map((r) => {
                const isSelected = roomId === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setRoomId(r.id)}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(15, 23, 42, 0.6)',
                      border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: isSelected ? '#38bdf8' : '#e2e8f0' }}>
                        {r.name}
                      </span>
                      <span style={{
                        fontSize: '9px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                        color: isSelected ? '#38bdf8' : '#94a3b8'
                      }}>
                        {r.tag}
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.3 }}>
                      {r.desc}
                    </p>
                  </div>
                );
              })}
            </div>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Or enter custom Room ID..."
              className="glass-input"
              style={{ fontSize: '12px', padding: '10px 14px' }}
            />
          </div>

          {/* Microphone Pre-Flight Test */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '12px 16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isMicMuted ? <MicOff size={16} color="#f43f5e" /> : <Mic size={16} color="#10b981" />}
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#e2e8f0' }}>
                  Microphone Preview
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMicMuted(!isMicMuted)}
                className="glass-btn"
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  background: isMicMuted ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  borderColor: isMicMuted ? '#f43f5e' : '#10b981',
                  color: isMicMuted ? '#f43f5e' : '#10b981'
                }}
              >
                {isMicMuted ? 'Unmute Mic' : 'Mute on Join'}
              </button>
            </div>

            {/* VU Meter */}
            <div style={{
              height: '6px',
              width: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '3px',
              overflow: 'hidden'
            }}>
              <motion.div
                style={{
                  height: '100%',
                  width: `${isMicMuted ? 0 : micVolume}%`,
                  background: 'linear-gradient(90deg, #10b981 0%, #38bdf8 70%, #f43f5e 100%)',
                  borderRadius: '3px',
                  transition: 'width 0.08s ease'
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                {isMicMuted ? 'Mic is muted' : (micTesting ? 'Speak to test levels...' : 'Click Join to permit mic')}
              </span>
              <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                {isMicMuted ? 'MUTED' : `${micVolume}%`}
              </span>
            </div>
          </div>

          {/* Join CTA Button */}
          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="glass-btn glass-btn-primary"
            style={{
              padding: '14px',
              fontSize: '15px',
              fontWeight: '700',
              justifyContent: 'center',
              borderRadius: '12px',
              marginTop: '4px'
            }}
          >
            <span>Enter Virtual Office</span>
            <ArrowRight size={18} />
          </motion.button>
        </form>

        {/* Keyboard Quick Navigation Guide */}
        <div style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          fontSize: '11px',
          color: '#64748b'
        }}>
          <span>⌨️ <strong style={{ color: '#94a3b8' }}>W, A, S, D / Arrows</strong> to move</span>
          <span>🖱️ <strong style={{ color: '#94a3b8' }}>Click</strong> on floor to walk</span>
          <span>🎙️ <strong style={{ color: '#94a3b8' }}>M</strong> to mute</span>
        </div>
      </motion.div>
    </div>
  );
}

