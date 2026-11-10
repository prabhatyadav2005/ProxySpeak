import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Mic, MicOff, Navigation, Radio, MapPin } from 'lucide-react';

export default function ParticipantsDrawer({
  isOpen,
  onClose,
  self,
  peers = [],
  activeVoicePeers = new Set(),
  onWalkToPeer
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 340 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 340 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="glass-panel"
          style={{
            position: 'absolute',
            top: '70px',
            right: '20px',
            width: '320px',
            maxHeight: 'calc(100vh - 120px)',
            zIndex: 100,
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}
        >
          {/* Drawer Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} color="#38bdf8" />
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                Room Participants ({peers.length + 1})
              </h3>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />

          {/* User List Container */}
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
            {/* Self Card */}
            {self && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: self.avatarColor || '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '12px',
                    border: '2px solid #ffffff'
                  }}>
                    {self.username ? self.username.charAt(0).toUpperCase() : 'Y'}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>
                      {self.username} <span style={{ fontSize: '10px', color: '#38bdf8' }}>(You)</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                      Zone: {self.currentZone || 'Open Space'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {self.isSpeaking && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '10px' }}>
                      <span className="wave-bar" />
                      <span className="wave-bar" />
                      <span className="wave-bar" />
                    </div>
                  )}
                  {self.isMuted ? <MicOff size={13} color="#f43f5e" /> : <Mic size={13} color="#10b981" />}
                </div>
              </div>
            )}

            {/* Remote Peers List */}
            {peers.map((peer) => {
              const inVoice = activeVoicePeers.has(peer.socketId);
              return (
                <div
                  key={peer.socketId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: inVoice ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.5)',
                    border: `1px solid ${inVoice ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: peer.avatarColor || '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '12px',
                      border: inVoice ? '2px solid #34d399' : '2px solid rgba(255, 255, 255, 0.4)',
                      boxShadow: inVoice ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none'
                    }}>
                      {peer.username ? peer.username.charAt(0).toUpperCase() : 'P'}
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: inVoice ? '#34d399' : '#e2e8f0' }}>
                        {peer.username}
                      </div>
                      <div style={{ fontSize: '10px', color: inVoice ? '#10b981' : '#64748b' }}>
                        {inVoice ? '🔊 In Proximity' : '🔇 Out of Range'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {peer.isSpeaking && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '10px' }}>
                        <span className="wave-bar" />
                        <span className="wave-bar" />
                        <span className="wave-bar" />
                      </div>
                    )}
                    {peer.isMuted ? <MicOff size={13} color="#f43f5e" /> : null}

                    {/* Walk to peer button */}
                    {onWalkToPeer && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onWalkToPeer(peer)}
                        style={{
                          background: 'rgba(56, 189, 248, 0.1)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          borderRadius: '6px',
                          color: '#38bdf8',
                          padding: '4px 6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '10px'
                        }}
                        title="Walk towards this player"
                      >
                        <Navigation size={10} />
                      </motion.button>
                    )}
                  </div>
                </div>
              );
            })}

            {peers.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: '#64748b', fontSize: '12px' }}>
                <p>No other colleagues currently in this space.</p>
                <p style={{ fontSize: '11px', marginTop: '6px', color: '#38bdf8' }}>
                  Share the room link or open another tab in #peer mode!
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

