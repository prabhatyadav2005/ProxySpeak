import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Radar, X } from 'lucide-react';

export default function SpatialRadar({
  isOpen,
  onClose,
  localPositionRef,
  peersRef,
  activeVoicePeers,
  earshotRadius = 130
}) {
  const radarCanvasRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let sweepAngle = 0;

    const RADAR_SIZE = 180;
    const CENTER = RADAR_SIZE / 2;
    const RADAR_SCALE = (CENTER - 15) / 320; // 320px in world maps to radar edge

    const render = () => {
      sweepAngle = (sweepAngle + 0.04) % (Math.PI * 2);

      ctx.clearRect(0, 0, RADAR_SIZE, RADAR_SIZE);

      // Radar Screen Background
      ctx.fillStyle = '#060a12';
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, CENTER - 2, 0, Math.PI * 2);
      ctx.fill();

      // Concentric Range Rings
      const rings = [60, 130, 240];
      rings.forEach((r, idx) => {
        const ringPx = r * RADAR_SCALE;
        ctx.beginPath();
        ctx.arc(CENTER, CENTER, ringPx, 0, Math.PI * 2);
        ctx.strokeStyle = idx === 1 ? 'rgba(16, 185, 129, 0.45)' : 'rgba(56, 189, 248, 0.15)';
        ctx.lineWidth = idx === 1 ? 1.5 : 1;
        if (idx === 1) ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Crosshairs
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(CENTER, 8);
      ctx.lineTo(CENTER, RADAR_SIZE - 8);
      ctx.moveTo(8, CENTER);
      ctx.lineTo(RADAR_SIZE - 8, CENTER);
      ctx.stroke();

      // Rotating Radar Sweep Beam
      const sweepGradient = ctx.createConicGradient(sweepAngle, CENTER, CENTER);
      sweepGradient.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
      sweepGradient.addColorStop(0.12, 'rgba(56, 189, 248, 0.05)');
      sweepGradient.addColorStop(0.3, 'rgba(56, 189, 248, 0)');
      sweepGradient.addColorStop(1, 'rgba(56, 189, 248, 0)');

      ctx.fillStyle = sweepGradient;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, CENTER - 4, 0, Math.PI * 2);
      ctx.fill();

      // Sweeping Edge Line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(CENTER, CENTER);
      ctx.lineTo(
        CENTER + Math.cos(sweepAngle) * (CENTER - 4),
        CENTER + Math.sin(sweepAngle) * (CENTER - 4)
      );
      ctx.stroke();

      const local = localPositionRef.current;
      const peers = peersRef.current;

      // Plot Remote Peer Blips
      if (local && peers) {
        peers.forEach((peer, peerSocketId) => {
          const dx = peer.x - local.x;
          const dy = peer.y - local.y;
          const dist = Math.hypot(dx, dy);

          const blipX = CENTER + dx * RADAR_SCALE;
          const blipY = CENTER + dy * RADAR_SCALE;

          // Only draw if within radar perimeter
          if (Math.hypot(blipX - CENTER, blipY - CENTER) < CENTER - 6) {
            const inVoice = activeVoicePeers.has(peerSocketId);

            if (inVoice) {
              ctx.beginPath();
              ctx.arc(blipX, blipY, 6, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
              ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(blipX, blipY, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = inVoice ? '#34d399' : (peer.avatarColor || '#38bdf8');
            ctx.shadowColor = inVoice ? '#10b981' : '#38bdf8';
            ctx.shadowBlur = 6;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Peer label
            ctx.font = 'bold 8px monospace';
            ctx.fillStyle = inVoice ? '#34d399' : '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText(peer.username?.substring(0, 5) || 'Peer', blipX, blipY - 5);
          }
        });
      }

      // Local Player Blip (Center)
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Compass Cardinal Labels
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.textAlign = 'center';
      ctx.fillText('N', CENTER, 13);
      ctx.fillText('S', CENTER, RADAR_SIZE - 6);
      ctx.fillText('W', 12, CENTER + 3);
      ctx.fillText('E', RADAR_SIZE - 10, CENTER + 3);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, localPositionRef, peersRef, activeVoicePeers, earshotRadius]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      className="glass-panel"
      style={{
        position: 'absolute',
        top: '70px',
        left: '20px',
        zIndex: 100,
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        boxShadow: '0 15px 35px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.15)'
      }}
    >
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Radar size={14} color="#38bdf8" />
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#f8fafc', letterSpacing: '0.04em' }}>
            SPATIAL RADAR
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={14} />
        </button>
      </div>

      <canvas
        ref={radarCanvasRef}
        width={180}
        height={180}
        style={{
          borderRadius: '50%',
          border: '1.5px solid rgba(56, 189, 248, 0.4)',
          boxShadow: 'inset 0 0 15px rgba(0,0,0,0.8)'
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '10px', color: '#64748b' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399' }} /> In Earshot
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#38bdf8' }} /> Out of Range
        </span>
      </div>
    </motion.div>
  );
}

