import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Login from './Login.jsx'
import { Building2 } from 'lucide-react'

function VerifyScreen({ token }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setMessage('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setMessage('Passwords do not match.'); return; }
    setStatus('loading');
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('crm_session', data.token);
        localStorage.setItem('crm_user', JSON.stringify(data.user));
        window.history.replaceState({}, '', '/');
        window.location.reload();
      } else {
        setMessage(data.message || 'Something went wrong.');
        setStatus('error');
      }
    } catch {
      setMessage('Network error. Please try again.');
      setStatus('error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', width: '100vw', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '420px', margin: '0 16px', backgroundColor: '#ffffff', borderRadius: '16px', padding: '40px 36px', boxShadow: '0 25px 50px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '28px', gap: '10px' }}>
          <div style={{ backgroundColor: '#f0fdf4', padding: '14px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
            <Building2 size={32} style={{ color: '#059669' }} />
          </div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>A&A Partners CRM</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b', textAlign: 'center' }}>You've been invited. Set your password to get started.</p>
        </div>

        {message && (
          <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', border: '1px solid #fca5a5' }}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>New Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required style={{ width: '100%', padding: '11px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Confirm Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" required style={{ width: '100%', padding: '11px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <button type="submit" disabled={status === 'loading'} style={{ width: '100%', padding: '12px', backgroundColor: '#059669', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: status === 'loading' ? 'not-allowed' : 'pointer', opacity: status === 'loading' ? 0.7 : 1, marginTop: '4px' }}>
            {status === 'loading' ? 'Setting up your account…' : 'Set Password & Enter CRM'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Root() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('crm_session'));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_user') || '{}'); } catch { return {}; }
  });

  // Always show verify screen if token is in URL, regardless of login state
  const params = new URLSearchParams(window.location.search);
  const verifyToken = params.get('token');
  if (verifyToken) {
    return <VerifyScreen token={verifyToken} />;
  }

  const handleLogin = (userData) => {
    setUser(userData);
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('crm_session');
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch {}
    }
    localStorage.removeItem('crm_session');
    localStorage.removeItem('crm_user');
    setIsLoggedIn(false);
    setUser({});
  };

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return <App user={user} onLogout={handleLogout} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
