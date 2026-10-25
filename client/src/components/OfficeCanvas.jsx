import React, { useRef, useEffect } from 'react';
import { useKeyboardMovement } from '../hooks/useKeyboardMovement';

const EARSHOT_RADIUS = 100; 
const AVATAR_RADIUS = 14;   
const SPEED = 4;            

export default function OfficeCanvas() {
  const canvasRef = useRef(null);
  
  const position = useRef({ x: 400, y: 300 });
  
  const keys = useKeyboardMovement();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const gameLoop = () => {

        if (keys.current['w'] || keys.current['arrowup']) {
        position.current.y = Math.max(AVATAR_RADIUS, position.current.y - SPEED);
      }
      if (keys.current['s'] || keys.current['arrowdown']) {
        position.current.y = Math.min(canvas.height - AVATAR_RADIUS, position.current.y + SPEED);
      }
      if (keys.current['a'] || keys.current['arrowleft']) {
        position.current.x = Math.max(AVATAR_RADIUS, position.current.x - SPEED);
      }
      if (keys.current['d'] || keys.current['arrowright']) {
        position.current.x = Math.min(canvas.width - AVATAR_RADIUS, position.current.x + SPEED);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      
      ctx.beginPath();
      ctx.arc(position.current.x, position.current.y, EARSHOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.12)'; 
      ctx.fill();
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(position.current.x, position.current.y, AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb'; 
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('You', position.current.x, position.current.y - AVATAR_RADIUS - 6);

      
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    
    animationFrameId = requestAnimationFrame(gameLoop);

    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [keys]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
      <h2 style={{ color: '#0f172a', marginBottom: '12px' }}>ProxiSpeak Virtual Workspace</h2>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{
          background: '#0f172a',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          border: '1px solid #334155'
        }}
      />
    </div>
  );
}