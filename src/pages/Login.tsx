import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../context/AuthContext';

const ROLES: { role: Role; label: string; color: string }[] = [
  { role: 'admin',  label: 'Admin',  color: '#dc2626' },
  { role: 'rh',     label: 'RH',     color: '#d97706' },
  { role: 'kam',    label: 'KAM',    color: '#2563eb' },
  { role: 'arpm',   label: 'ARPM',   color: '#7c3aed' },
];

export function Login() {
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('Delta@123');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await login(email, password);
    setLoading(false);
    if (!result.success) setError(result.error || 'Login failed.');
  }

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

          {/* Role selection */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>I AM LOGGING IN AS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {ROLES.map(({ role, label, color }) => {
                const active = selectedRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => { setSelectedRole(role); setError(''); }}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 10,
                      border: `2px solid ${active ? color : 'var(--border)'}`,
                      background: active ? color : 'var(--surface2)',
                      color: active ? '#fff' : 'var(--text)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 700,
                      transition: 'all 0.15s',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {selectedRole && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
                Signing in as <strong style={{ color: 'var(--text)' }}>{selectedRole.toUpperCase()}</strong>
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>YOUR ONMOVE EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="yourname@onmove.in"
                style={{ width: '100%' }}
                required
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%' }}
                required
              />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Default password is pre-filled — change it after first login</div>
            </div>

            {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{error}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0', opacity: !selectedRole ? 0.6 : 1 }}
              disabled={loading || !selectedRole}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 6 }}>NEED ACCESS?</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
              Contact your admin to get your Onmove email registered in the system. Once registered, use your company email and the default password above.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
