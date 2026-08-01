import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiSettings, apiBankAccounts, apiUsers, apiTransactions, apiCustomers, apiRules, type DbUser } from '../api';

export function Settings() {
  const { user } = useAuth();
  const [adviseReminder, setAdviseReminder] = useState(7);
  const [largePaymentThreshold, setLargePaymentThreshold] = useState(5000000);
  const [saved, setSaved] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<DbUser[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState<Partial<DbUser> & { password?: string }>({ role: 'kam', active: true });
  const [userSaving, setUserSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    apiSettings.getAll().then(map => {
      if (map.adviseReminder) setAdviseReminder(Number(map.adviseReminder));
      if (map.largePaymentThreshold) setLargePaymentThreshold(Number(map.largePaymentThreshold));
    }).catch(() => {});
    apiBankAccounts.getAll().then(map => setBankAccounts(map)).catch(() => {});
    apiUsers.getAll().then(us => setUsers(us)).catch(() => {});
  }, []);

  const canEdit = user?.role === 'admin';

  if (!canEdit && user?.role !== 'founder') {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
        Settings are only accessible to Admin users.
      </div>
    );
  }

  async function handleAddUser() {
    if (!newUser.name || !newUser.email || !newUser.role || !newUser.password) return;
    setUserSaving(true);
    try {
      const created = await apiUsers.create({ id: '', name: newUser.name, email: newUser.email, role: newUser.role, kam_name: newUser.kam_name || null, rh_name: newUser.rh_name || null, active: true, password: newUser.password } as never);
      setUsers(prev => [...prev, created]);
      setShowAddUser(false);
      setNewUser({ role: 'kam', active: true });
    } catch { /* server will return error */ } finally { setUserSaving(false); }
  }

  async function handleUpdateUser(id: string, updates: Partial<DbUser>) {
    try {
      const updated = await apiUsers.update(id, updates);
      setUsers(prev => prev.map(u => u.id === id ? updated : u));
      setEditUserId(null);
    } catch { /* noop */ }
  }

  async function handleDeleteUser(id: string) {
    try {
      await apiUsers.delete(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      setDeleteUserId(null);
    } catch { /* noop */ }
  }

  async function handleBackupExport() {
    setBackupBusy(true);
    try {
      const [txns, custs, rules] = await Promise.all([
        apiTransactions.getAll(),
        apiCustomers.getAll(),
        apiRules.getAll(),
      ]);
      const payload = {
        exportedAt: new Date().toISOString(),
        transactions: txns,
        customers: custs,
        rules,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Delta_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBackupBusy(false);
    }
  }

  function save() {
    apiSettings.save({
      adviseReminder: String(adviseReminder),
      largePaymentThreshold: String(largePaymentThreshold),
    }).then(() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }).catch(() => {});
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>
      {/* Bank Accounts */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Bank Accounts</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(bankAccounts).map(([key, accNo]) => {
            const [bank, ...rest] = key.split('-');
            const company = rest.join('-');
            return (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{bank} — {company}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'monospace' }}>{accNo}</div>
                </div>
                <span className="badge badge-green">Active</span>
              </div>
            );
          })}
          {Object.keys(bankAccounts).length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>No bank accounts configured. Add them in Import → Bank Accounts.</div>
          )}
        </div>
      </div>

      {/* Companies */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Companies</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          {['Zast Logistics Solutions Pvt Ltd', 'Transin Logistics Private Limited'].map(c => (
            <div key={c} style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontWeight: 500 }}>{c}</div>
          ))}
        </div>
      </div>

      {/* Collection Settings */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Collection Settings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>PAYMENT ADVISE REMINDER AFTER (DAYS)</label>
            <input type="number" value={adviseReminder} onChange={e => setAdviseReminder(Number(e.target.value))} style={{ width: 100 }} min={1} max={30} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>LARGE PAYMENT ALERT THRESHOLD (₹)</label>
            <input type="number" value={largePaymentThreshold} onChange={e => setLargePaymentThreshold(Number(e.target.value))} style={{ width: 160 }} step={100000} />
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Transactions above ₹{(largePaymentThreshold / 100000).toFixed(0)} L will be highlighted</div>
          </div>
        </div>
      </div>

      {canEdit && (
        <div>
          <button className="btn btn-primary" onClick={save}>{saved ? '✓ Saved' : 'Save Settings'}</button>
        </div>
      )}

      {/* Advise file storage notice */}
      <div style={{ padding: '14px 18px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>
        <strong>⚠ Advise file storage:</strong> Payment advise files are currently stored as base64 in PostgreSQL.
        This works for moderate volumes but will increase DB size and slow queries at scale.
        For production at high volume, migrate to an object store (AWS S3 / Cloudflare R2) and store only the file URL in the DB.
      </div>

      {/* Data Backup */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Data Backup</h3>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              Export all transactions, customers, and rules as a JSON backup file.
            </div>
          </div>
          <button className="btn btn-secondary" onClick={handleBackupExport} disabled={backupBusy} style={{ whiteSpace: 'nowrap' }}>
            {backupBusy ? 'Exporting…' : '⬇ Export Backup'}
          </button>
        </div>
      </div>

      {/* User Management */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>User Management</h3>
          {canEdit && <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowAddUser(true)}>+ Add User</button>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>KAM Name</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{u.email}</td>
                  <td><span className={`badge badge-${u.role === 'admin' ? 'red' : u.role === 'founder' ? 'blue' : (u.role === 'rh' || u.role === 'arpm') ? 'yellow' : 'green'}`}>{u.role}</span></td>
                  <td style={{ fontSize: 12 }}>{u.kam_name || u.rh_name || '—'}</td>
                  <td>
                    <span className={`badge badge-${u.active !== false ? 'green' : 'gray'}`}>{u.active !== false ? 'Active' : 'Inactive'}</span>
                  </td>
                  {canEdit && (
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => { setEditUserId(u.id); setNewUser({ ...u }); }}>
                        Edit
                      </button>
                      <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger)' }}
                        onClick={() => setDeleteUserId(u.id)}
                        disabled={u.id === user?.id}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {(showAddUser || editUserId) && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowAddUser(false); setEditUserId(null); setNewUser({ role: 'kam', active: true }); } }}>
          <div className="card" style={{ padding: 28, width: 440 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>{editUserId ? 'Edit User' : 'Add New User'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Full Name', key: 'name', type: 'text', placeholder: 'Full name' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'user@example.com' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <div className="filter-label">{label}</div>
                  <input type={type} placeholder={placeholder}
                    value={(newUser as Record<string, string>)[key] || ''}
                    onChange={e => setNewUser(prev => ({ ...prev, [key]: e.target.value }))}
                    style={{ width: '100%' }} />
                </div>
              ))}
              {!editUserId && (
                <div>
                  <div className="filter-label">Password</div>
                  <input type="password" placeholder="Set initial password"
                    value={newUser.password || ''}
                    onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                    style={{ width: '100%' }} />
                </div>
              )}
              <div>
                <div className="filter-label">Role</div>
                <select value={newUser.role || 'kam'} onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))} style={{ width: '100%' }}>
                  <option value="admin">Admin</option>
                  <option value="rh">Regional Head</option>
                  <option value="kam">KAM</option>
                </select>
              </div>
              <div>
                <div className="filter-label">KAM / RH Name (for role-based filtering)</div>
                <input placeholder="e.g. Rahul Sharma" value={newUser.kam_name || newUser.rh_name || ''}
                  onChange={e => setNewUser(prev => ({ ...prev, kam_name: e.target.value, rh_name: e.target.value }))}
                  style={{ width: '100%' }} />
              </div>
              {editUserId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" checked={newUser.active !== false} onChange={e => setNewUser(prev => ({ ...prev, active: e.target.checked }))} />
                  <span style={{ fontSize: 13 }}>Active</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => { setShowAddUser(false); setEditUserId(null); setNewUser({ role: 'kam', active: true }); }}>Cancel</button>
              <button className="btn btn-primary" disabled={userSaving}
                onClick={() => editUserId ? handleUpdateUser(editUserId, newUser as DbUser) : handleAddUser()}>
                {userSaving ? 'Saving…' : editUserId ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirm */}
      {deleteUserId && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteUserId(null); }}>
          <div className="card" style={{ padding: 28, width: 380 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'var(--danger)' }}>Delete User?</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
              {users.find(u => u.id === deleteUserId)?.name} ({users.find(u => u.id === deleteUserId)?.email}) will be permanently removed.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteUserId(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => handleDeleteUser(deleteUserId)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
