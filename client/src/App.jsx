import React from 'react';
import OfficeCanvas from './components/OfficeCanvas';

export default function App() {
  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', padding: '16px' }}>
      <OfficeCanvas />
    </main>
  );
}