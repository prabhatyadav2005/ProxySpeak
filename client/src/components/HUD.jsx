// client/src/components/HUD.jsx
import React from 'react';

export default function HUD({ 
  status = 'Connecting...', 
  participantCount = 1, 
  isMicOn = true, 
  onToggleMic, 
  currentZone = 'Open Space',
  fps = 60
}) {
  const getFpsColor = (val) => {
    if (val >= 55) return { bg: '#064e3b', text: '#34d399', border: '#059669' };
    if (val >= 35) return { bg: '#78350f', text: '#fcd34d', border: '#d97706' };
    return { bg: '#7f1d1d', text: '#f87171', border: '#dc2626' };
  };

  const fpsStyle = getFpsColor(fps);

  return (
    <div style={{
      width: '800px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 16px',
      backgroundColor: '#1e293b',
      borderRadius: '8px 8px 0 0',
      border: '1px solid #334155',
      borderBottom: 'none',
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#f8fafc' }}>ProxySpeak</h3>
        <span style={{
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '9999px',
          background: status === 'Connected' ? '#064e3b' : '#7f1d1d',
          color: status === 'Connected' ? '#34d399' : '#f87171',
          border: `1px solid ${status === 'Connected' ? '#059669' : '#dc2626'}`
        }}>
          ● {status}
        </span>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
          Zone: <strong style={{ color: '#e2e8f0' }}>{currentZone}</strong>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Real-time 60 FPS Benchmark Monitor */}
        <span style={{
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '6px',
          background: fpsStyle.bg,
          color: fpsStyle.text,
          border: `1px solid ${fpsStyle.border}`,
          fontFamily: 'monospace',
          fontWeight: 'bold'
        }}>
          {fps} FPS
        </span>

        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
          Participants: <strong style={{ color: '#38bdf8' }}>{participantCount}</strong>
        </span>

        <button
          type="button"
          onClick={onToggleMic}
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: isMicOn ? '#059669' : '#dc2626',
            color: '#ffffff',
            fontWeight: '600'
          }}
        >
          {isMicOn ? '🎤 Mic Active' : '🔇 Mic Muted'}
        </button>
      </div>
    </div>
  );
}