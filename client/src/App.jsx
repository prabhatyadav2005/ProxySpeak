import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import JoinScreen from './components/JoinScreen';
import OfficeCanvas from './components/OfficeCanvas';

export default function App() {
  const [joined, setJoined] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

  // Parse URL query or hash on mount for seamless multi-tab testing
  const [initialRoomId, setInitialRoomId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'main-office';
  });

  useEffect(() => {
    // If URL has #peer, set client role
    const isPeerTab = window.location.hash === '#peer';
    if (isPeerTab) {
      sessionStorage.setItem('client_role', 'B');
    }
  }, []);

  const handleJoin = (profile) => {
    setUserProfile(profile);
    setJoined(true);
  };

  const handleLeaveRoom = () => {
    setJoined(false);
    setUserProfile(null);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      background: '#07090e',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <AnimatePresence mode="wait">
        {!joined ? (
          <motion.div
            key="join-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35 }}
            style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
          >
            <JoinScreen onJoin={handleJoin} initialRoomId={initialRoomId} />
          </motion.div>
        ) : (
          <motion.div
            key="canvas-workspace"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.4 }}
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '20px 10px'
            }}
          >
            <OfficeCanvas userProfile={userProfile} onLeaveRoom={handleLeaveRoom} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
