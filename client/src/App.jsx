import React from 'react';
import OfficeCanvas from './components/OfficeCanvas.jsx';

export default function App() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', minHeight: '100vh', background: '#0b0f19' }}>
      <OfficeCanvas />
    </div>
  );
}
