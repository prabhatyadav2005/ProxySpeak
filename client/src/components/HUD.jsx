import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Users, 
  Radio, 
  Share2, 
  Check, 
  LogOut, 
  Compass, 
  Activity,
  Radar
} from 'lucide-react';

export default function HUD({
  status = 'Connecting...',
  participantCount = 1,
  isMicOn = true,
  onToggleMic,
  isDeafened = false,
  onToggleDeafen,
  currentZone = 'Open Space',
  roomId = 'main-office',
  fps = 60,
  activePeersInVoice = 0,
  onToggleParticipants,
  isParticipantsOpen = false,
  onToggleRadar,
  isRadarOpen = false,
  onLeaveRoom
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const getFpsColor = (val) => {
    if (val >= 55) return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: '#059669' };
    if (val >= 35) return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fcd34d', border: '#d97706' };
    return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: '#dc2626' };
  };

  const fpsStyle = getFpsColor(fps);

  return (
    <div style={{
      width: '100%',
      maxWidth: '920px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 18px',
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRadius: '16px 16px 0 0',
      border: '1px solid rgba(56, 189, 248, 0.25)',
      borderBottom: 'none',
      boxSizing: 'border-box',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
    }}>
      {/* Left: Branding, Connection, & Zone Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #0284c7, #2563eb)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px rgba(56, 189, 248, 0.4)'
          }}>
            <Radio size={16} color="#ffffff" />
          </div>
          <span style={{ fontSize: '15px', fontWeight: '800', letterSpacing: '-0.02em', color: '#f8fafc' }}>
            Proxy<span style={{ color: '#38bdf8' }}>Speak</span>
          </span>
        </div>

        {/* Connection Status Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          fontWeight: '600',
          padding: '3px 10px',
          borderRadius: '9999px',
          background: status === 'Connected' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: status === 'Connected' ? '#34d399' : '#f87171',
          border: `1px solid ${status === 'Connected' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: status === 'Connected' ? '#10b981' : '#ef4444',
            display: 'inline-block',
            animation: status === 'Connected' ? 'pingDot 2s infinite' : 'none'
          }} />
          {status}
        </div>

        {/* Current Zone Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          color: '#94a3b8',
          background: 'rgba(30, 41, 59, 0.5)',
          padding: '3px 10px',
          borderRadius: '8px'
        }}>
          <Compass size={13} color="#38bdf8" />
          <span>Zone:</span>
          <strong style={{ color: '#e2e8f0' }}>{currentZone}</strong>
        </div>

        {/* Room Share Link Button */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleCopyLink}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            color: copied ? '#34d399' : '#94a3b8',
            background: 'rgba(30, 41, 59, 0.6)',
            padding: '3px 9px',
            borderRadius: '6px',
            border: `1px solid ${copied ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
            cursor: 'pointer'
          }}
          title="Click to copy room invite link"
        >
          {copied ? <Check size={12} /> : <Share2 size={12} />}
          <span>{copied ? 'Link Copied!' : `#${roomId}`}</span>
        </motion.button>
      </div>

      {/* Right: Controls & Dashboard Telemetry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Real-time FPS Monitor */}
        <div style={{
          fontSize: '11px',
          padding: '3px 9px',
          borderRadius: '6px',
          background: fpsStyle.bg,
          color: fpsStyle.text,
          border: `1px solid ${fpsStyle.border}`,
          fontFamily: 'var(--font-mono)',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <Activity size={12} />
          {fps} FPS
        </div>

        {/* Spatial Radar Toggle */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={onToggleRadar}
          className="glass-btn"
          style={{
            padding: '6px 10px',
            fontSize: '12px',
            borderRadius: '8px',
            backgroundColor: isRadarOpen ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.6)',
            color: isRadarOpen ? '#38bdf8' : '#cbd5e1',
            border: `1px solid ${isRadarOpen ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`
          }}
          title="Toggle 360° Spatial Radar"
        >
          <Radar size={14} />
          <span>Radar</span>
        </motion.button>

        {/* Spatial Audio Active Voice Indicator */}
        {activePeersInVoice > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              padding: '3px 9px',
              borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '12px' }}>
              <span className="wave-bar" />
              <span className="wave-bar" />
              <span className="wave-bar" />
            </div>
            <span>{activePeersInVoice} in earshot</span>
          </motion.div>
        )}

        {/* Microphone Toggle Button */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={onToggleMic}
          className="glass-btn"
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '8px',
            backgroundColor: isMicOn ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: isMicOn ? '#34d399' : '#f87171',
            border: `1px solid ${isMicOn ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
          }}
          title="Toggle Microphone (Shortcut: M)"
        >
          {isMicOn ? <Mic size={14} /> : <MicOff size={14} />}
          <span>{isMicOn ? 'Mic Active' : 'Muted'}</span>
          <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '4px', background: 'rgba(0,0,0,0.3)' }}>M</span>
        </motion.button>

        {/* Deafen (Audio output mute) */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={onToggleDeafen}
          className="glass-btn"
          style={{
            padding: '6px 10px',
            fontSize: '12px',
            borderRadius: '8px',
            backgroundColor: isDeafened ? 'rgba(239, 68, 68, 0.2)' : 'rgba(30, 41, 59, 0.6)',
            color: isDeafened ? '#f87171' : '#cbd5e1',
            border: `1px solid ${isDeafened ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`
          }}
          title={isDeafened ? 'Undeafen Audio' : 'Deafen (Mute incoming voices)'}
        >
          {isDeafened ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </motion.button>

        {/* Participants Drawer Toggle */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={onToggleParticipants}
          className="glass-btn"
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '8px',
            backgroundColor: isParticipantsOpen ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.6)',
            color: isParticipantsOpen ? '#38bdf8' : '#e2e8f0',
            border: `1px solid ${isParticipantsOpen ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`
          }}
        >
          <Users size={14} />
          <span>{participantCount}</span>
        </motion.button>

        {/* Leave Room Button */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={onLeaveRoom}
          className="glass-btn"
          style={{
            padding: '6px 10px',
            fontSize: '12px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#f87171'
          }}
          title="Exit Room to Lobby"
        >
          <LogOut size={14} />
        </motion.button>
      </div>
    </div>
  );
}
