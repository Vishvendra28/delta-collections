import React from 'react';
import type { Page } from '../App';
import { useAuth } from '../context/AuthContext';
import { useTransactions } from '../context/TransactionsContext';
import { useRecycleBin } from '../context/RecycleBinContext';

interface Props {
  current: Page;
  onNavigate: (p: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS: { page: Page; label: string; icon: string; adminOnly?: boolean }[] = [
  { page: 'dashboard',      label: 'Collection Dashboard',  icon: 'ti-layout-dashboard' },
  { page: 'target',        label: 'Target vs Actual',       icon: 'ti-target' },
  { page: 'transactions',   label: 'Transactions',           icon: 'ti-arrows-exchange' },
  { page: 'manual-review',  label: 'Manual Review',          icon: 'ti-eye-check' },
  { page: 'pending-advise', label: 'Pending Payment Advises', icon: 'ti-hourglass' },
  { page: 'import',         label: 'Import Statement',       icon: 'ti-upload', adminOnly: true },
  { page: 'rules',          label: 'Rule Manager',           icon: 'ti-adjustments-horizontal', adminOnly: true },
  { page: 'settings',       label: 'Settings',               icon: 'ti-settings', adminOnly: true },
  { page: 'profile',        label: 'My Profile',             icon: 'ti-user' },
  { page: 'history',        label: 'Activity History',       icon: 'ti-history' },
  { page: 'recycle-bin',   label: 'Recycle Bin',            icon: 'ti-trash', adminOnly: true },
];

export function Sidebar({ current, onNavigate, collapsed, onToggle }: Props) {
  const { user } = useAuth();
  const { transactions } = useTransactions();
  const { binItems } = useRecycleBin();
  const reviewCount = transactions.filter(t => t.status === 'manual_review').length;
  const pendingCount = transactions.filter(t => t.status === 'matched' && t.adviseStatus === 'pending').length;
  const binCount = binItems.length;

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.adminOnly && user?.role !== 'admin') return false;
    return true;
  });

  return (
    <div style={{
      width: collapsed ? 56 : 220,
      minWidth: collapsed ? 56 : 220,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s, min-width 0.2s',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: '16px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, background: 'var(--brand)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>D</div>
        {!collapsed && <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', whiteSpace: 'nowrap' }}>Delta Collections</span>}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {visibleItems.map(item => {
          const active = current === item.page;
          const badge = item.page === 'manual-review' ? reviewCount : item.page === 'pending-advise' ? pendingCount : item.page === 'recycle-bin' ? binCount : 0;
          return (
            <button
              key={item.page}
              onClick={() => onNavigate(item.page)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: collapsed ? '10px 14px' : '9px 14px',
                border: 'none',
                background: active ? 'var(--brand-light)' : 'transparent',
                color: active ? 'var(--brand)' : 'var(--text2)',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                borderLeft: `3px solid ${active ? 'var(--brand)' : 'transparent'}`,
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                position: 'relative',
              }}
            >
              <i className={`ti ${item.icon}`} aria-hidden="true" style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}></i>
              {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
              {!collapsed && badge > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{badge}</span>
              )}
              {collapsed && badge > 0 && (
                <span style={{ position: 'absolute', top: 6, right: 6, background: '#ef4444', color: '#fff', borderRadius: 999, fontSize: 9, fontWeight: 700, padding: '1px 4px' }}>{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        style={{ padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text3)', borderTop: '1px solid var(--border)', fontSize: 16, textAlign: collapsed ? 'center' : 'right' }}
      >
        {collapsed ? '→' : '←'}
      </button>
    </div>
  );
}
