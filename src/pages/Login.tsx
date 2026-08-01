import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiAuth } from '../api';

type PublicUser = { id: string; name: string; role: string; kam_name?: string; rh_name?: string };

const ROLE_COLORS: Record<string, string> = {
  rh:   '#d97706',
  kam:  '#2563eb',
  arpm: '#7c3aed',
};

export function Login() {
  const { login, loginAsUser } = useAuth();

  const [users, setUsers]               = useState<PublicUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedId, setSelectedId]     = useState('');
  const [enterLoading, setEnterLoading] = useState(false);
  const [enterError, setEnterError]     = useState('');

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminEmail, setAdminEmail]         = useState('');
  const [adminPassword, setAdminPassword]   = useState('Delta@123');
  const [adminLoading, setAdminLoading]     = useState(false);
  const [adminError, setAdminError]         = useState('');

  useEffect(() => {
    apiAuth.getPublicUsers()
      .then(list => setUsers(list))
      .catch(() => setEnterError('Could not load users. Is the server running?'))
      .finally(() => setLoadingUsers(false));
  }, []);

  async function handleEnter() {
    if (!selectedId) return;
    setEnterLoading(true);
    setEnterError('');
    const result = await loginAsUser(selectedId);
    setEnterLoading(false);
    if (!result.success) setEnterError(result.error || 'Failed to enter app');
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setAdminLoading(true);
    setAdminError('');
    const result = await login(adminEmail, adminPassword);
    setAdminLoading(false);
    if (!result.success) setAdminError(result.error || 'Login failed');
  }

  const selectedUser = users.find(u => u.id === selectedId);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: 'var(--brand)', borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 12 }}>D</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Delta Collections</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>B2B Collections Tracking System</p>
        </div>

        <div className="card" style={{ padding: 28 }}>

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>SELECT YOUR NAME TO CONTINUE</div>

          {loadingUsers ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>Loading users...</div>
          ) : (
            <select
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setEnterError(''); }}
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, marginBottom: 16, cursor: 'pointer' }}
            >
              <option value="">— Choose your name —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.toUpperCase()})
                </option>
              ))}
            </select>
          )}

          {selectedUser && (
            <div style={{ marginBottom: 14, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: ROLE_COLORS[selectedUser.role] ?? '#64748b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                {selectedUser.name.charAt(0)}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{selectedUser.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{selectedUser.role.toUpperCase()}{selectedUser.kam_name ? ` · ${selectedUser.kam_name}` : ''}</div>
              </div>
            </div>
          )}

          {enterError && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>{enterError}</div>}

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 0', opacity: !selectedId ? 0.5 : 1 }}
            disabled={!selectedId || enterLoading}
            onClick={handleEnter}
          >
            {enterLoading ? 'Entering...' : 'Enter App'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}
            onClick={() => { setShowAdminModal(true); setAdminError(''); }}
          >
            Admin Login
          </button>

        </div>
      </div>

      {/* Admin Login Modal */}
      {showAdminModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdminModal(false); }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 380, padding: 28, position: 'relative' }}>
            <button
              onClick={() => setShowAdminModal(false)}
              style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)' }}
            >
              ×
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <div style={{ width: 36, height: 36, background: '#dc2626', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>A</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Admin Login</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Full access — changes require credentials</div>
              </div>
            </div>

            <form onSubmit={handleAdminLogin}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>EMAIL</label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  placeholder="admin@onmove.in"
                  style={{ width: '100%' }}
                  required
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>PASSWORD</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              {adminError && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{adminError}</div>}

              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px 0', background: '#dc2626', borderColor: '#dc2626' }} disabled={adminLoading}>
                {adminLoading ? 'Signing in...' : 'Sign In as Admin'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
