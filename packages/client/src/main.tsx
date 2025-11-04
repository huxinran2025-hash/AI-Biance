
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/theme.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--ink)' }}>
      <App />
    </div>
  </React.StrictMode>
);
