import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import './index.css'

// Two screens, so a path check rather than a router dependency. netlify.toml
// already rewrites unknown paths to index.html, so /admin loads this bundle and
// lands here. Trailing slash tolerated.
const isAdmin = /^\/admin\/?$/.test(window.location.pathname)

// Admin reads the same saved language as the app so the two do not disagree.
let lang = 'en'
try { const s = localStorage.getItem('tide_lang'); if (s === 'ml' || s === 'en') lang = s } catch { /* private mode */ }

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdmin ? <AdminPanel lang={lang} /> : <App />}
  </React.StrictMode>
)

// Service worker: registered only in a production build, because in dev it would
// cache Vite's module graph and serve stale code after every edit.
// Deliberately after load, so it never competes with the first paint.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .catch(err => console.warn('Service worker registration failed:', err))
  })
}
