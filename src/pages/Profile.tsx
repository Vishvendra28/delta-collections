import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCustomers } from '../context/CustomersContext';
import { apiAuth } from '../api';

export function Profile() {
  const { user } = useAuth();
  const { customers } = useCustomers();
  const [saved, setSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  async function handlePasswordChange() {
    if (!user) return;
    if (!currentPassword || !newPassword) { setPwError('Both fields are required.'); return; }
    setPwLoading(true);
    setPwError('');
    setPwSuccess(false);
    try {
      await apiAuth.changePassword(user.id, currentPassword, newPassword);
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  }

  const myCustomers = user?.role === 'kam'
    ? customers.filter(c => c.kam === user.kamName && !c.toPayFlag && c.active)
    : user?.role === 'rh' || user?.role === 'arpm'
    ? customers.filter(c => c.rh === user.rhName && !c.toPayFlag && c.active)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 500 }}>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
          <div style={{ width: 60, height: 60, background: 'var(--brand)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 700 }}>
            {user?.name?.charAt(0) ?? 'U'}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{user?.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{user?.email}</div>
            <span className="badge badge-blue" style={{ marginTop: 4 }}>{user?.role?.toUpperCase()}</span>
          </div>
        </div>

        {user?.kamName && (
          <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>KAM NAME</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{user.kamName}</div>
          </div>
        )}
        {user?.rhName && (
          <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>REGIONAL HEAD</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{user.rhName}</div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>CHANGE PASSWORD</label>
          <input type="password" placeholder="Current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          <input type="password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ width: '100%' }} />
          {pwError && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{pwError}</div>}
          {pwSuccess && <div style={{ color: 'var(--success, green)', fontSize: 12, marginTop: 6 }}>Password changed successfully.</div>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handlePasswordChange} disabled={pwLoading}>
            {pwLoading ? 'Saving...' : 'Change Password'}
          </button>
        </div>
      </div>

      {myCustomers.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>My Customers ({myCustomers.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {myCustomers.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13 }}>
                <span>{c.name}</span>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>{c.rh}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
