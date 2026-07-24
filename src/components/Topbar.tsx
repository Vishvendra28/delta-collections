import React, { useState } from 'react';
import type { Page } from '../App';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTransactions } from '../context/TransactionsContext';

interface Props {
  title: string;
  canGoBack: boolean;
  onGoBack: () => void;
  onNavigate: (p: Page) => void;
}

export function Topbar({ title, canGoBack, onGoBack, onNavigate }: Props) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const { transactions } = useTransactions();
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const reviewCount = transactions.filter(t => t.status === 'manual_review').length;
  const pendingCount = transactions.filter(t => t.status === 'matched' && t.adviseStatus === 'pending').length;
  const dupCount = transactions.filter(t => t.status === 'duplicate').length;
  const totalAlerts = reviewCount + (pendingCount > 0 ? 1 : 0) + (dupCount > 0 ? 1 : 0);

  const searchResults = search.length > 1
    ? transactions.filter(t =>
        t.status !== 'excluded' &&
        (t.customer.toLowerCase().includes(search.toLowerCase()) ||
         t.refNo.toLowerCase().includes(search.toLowerCase()) ||
         t.narration.toLowerCase().includes(search.toLowerCase()))
      ).slice(0, 8)
    : [];

  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'relative', zIndex: 50 }}>
      {/* Back */}
      {canGoBack && (
        <button onClick={onGoBack} className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: 16 }}>←</button>
      )}

      {/* Refresh */}
      <button onClick={() => window.location.reload()} className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: 15 }} title="Refresh">🔄</button>

      {/* Title */}
      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', flex: 1, minWidth: 0 }}>{title}</span>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <input
          placeholder="Search customer, ref no..."
          value={search}
          onChange={e => { setSearch(e.target.value); setShowSearch(true); }}
          onFocus={() => setShowSearch(true)}
          onBlur={() => setTimeout(() => setShowSearch(false), 200)}
          style={{ width: 220, padding: '6px 12px', fontSize: 13 }}
        />
        {showSearch && searchResults.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 100, marginTop: 4 }}>
            {searchResults.map(t => (
              <div
                key={t.id}
                onMouseDown={() => {
                  localStorage.setItem('delta_tx_search', search);
                  onNavigate('transactions');
                  setSearch('');
                }}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 12 }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t.customer}</div>
                <div style={{ color: 'var(--text2)' }}>₹{t.amount.toLocaleString('en-IN')} · {t.date} · {t.bank} · <span style={{ fontStyle: 'italic' }}>{t.status}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dark mode */}
      <button onClick={toggle} className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: 14 }}>
        {dark ? '☀' : '☾'}
      </button>

      {/* Notifications */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowNotif(n => !n); setShowProfile(false); }}
          className="btn btn-secondary"
          style={{ padding: '5px 10px', fontSize: 16, position: 'relative' }}
        >
          🔔
          {totalAlerts > 0 && (
            <span style={{ position: 'absolute', top: 2, right: 2, background: '#ef4444', color: '#fff', borderRadius: 999, fontSize: 9, fontWeight: 700, padding: '1px 4px', lineHeight: 1 }}>{totalAlerts}</span>
          )}
        </button>
        {showNotif && (
          <div style={{ position: 'absolute', top: '100%', right: 0, width: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-md)', zIndex: 100, marginTop: 6, padding: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', padding: '4px 8px 8px' }}>NOTIFICATIONS</div>
            {reviewCount > 0 && (
              <div onClick={() => { onNavigate('manual-review'); setShowNotif(false); }} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fef9c3' }}>
                <span>⚠</span>
                <span style={{ fontSize: 13, color: '#92400e' }}>{reviewCount} transaction{reviewCount > 1 ? 's' : ''} in Manual Review need attention</span>
              </div>
            )}
            {pendingCount > 0 && (
              <div onClick={() => { onNavigate('pending-advise'); setShowNotif(false); }} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
                <span>📎</span>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{pendingCount} Payment Advise{pendingCount > 1 ? 's' : ''} pending upload</span>
              </div>
            )}
            {dupCount > 0 && (
              <div style={{ padding: '8px 10px', borderRadius: 6, display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
                <span>🔁</span>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{dupCount} duplicate transaction{dupCount > 1 ? 's' : ''} detected</span>
              </div>
            )}
            {totalAlerts === 0 && <div style={{ padding: '8px 10px', color: 'var(--text2)', fontSize: 13 }}>All clear — no pending actions</div>}
          </div>
        )}
      </div>

      {/* Profile */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowProfile(p => !p); setShowNotif(false); }}
          style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
        >
          {user?.name?.charAt(0) ?? 'U'}
        </button>
        {showProfile && (
          <div style={{ position: 'absolute', top: '100%', right: 0, width: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-md)', zIndex: 100, marginTop: 6, padding: 8 }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.name}</div>
              <div style={{ color: 'var(--text2)', fontSize: 12 }}>{user?.email}</div>
              <span className="badge badge-blue" style={{ marginTop: 4 }}>{user?.role?.toUpperCase()}</span>
            </div>
            <button onClick={() => { onNavigate('profile'); setShowProfile(false); }} style={{ display: 'block', width: '100%', padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text)' }}>My Profile</button>
            <button onClick={logout} style={{ display: 'block', width: '100%', padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--danger)' }}>Sign Out</button>
          </div>
        )}
      </div>
    </div>
  );
}
