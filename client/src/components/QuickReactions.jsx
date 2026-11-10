import React from 'react';
import { motion } from 'framer-motion';

const EMOJIS = ['👋', '👍', '🔥', '🎉', '💡', '❤️'];

export default function QuickReactions({ onSendReaction }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="glass-panel"
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 14px',
        borderRadius: '9999px',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        zIndex: 50,
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
      }}
    >
      <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', marginRight: '4px' }}>
        React:
      </span>
      {EMOJIS.map((emoji) => (
        <motion.button
          key={emoji}
          whileHover={{ scale: 1.3, y: -4 }}
          whileTap={{ scale: 0.85 }}
          onClick={() => onSendReaction(emoji)}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '2px 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: 'none',
            transition: 'transform 0.15s ease'
          }}
          title={`Send ${emoji}`}
        >
          {emoji}
        </motion.button>
      ))}
    </motion.div>
  );
}

