import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TransactionsProvider } from './context/TransactionsContext';
import { RulesProvider } from './context/RulesContext';
import { HistoryProvider } from './context/HistoryContext';
import { CustomersProvider } from './context/CustomersContext';
import { RecycleBinProvider } from './context/RecycleBinContext';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { ManualReview } from './pages/ManualReview';
import { PendingAdvise } from './pages/PendingAdvise';
import { Import } from './pages/Import';
import { RuleManager } from './pages/RuleManager';
import { Settings } from './pages/Settings';
import { Profile } from './pages/Profile';
import { History } from './pages/History';
import { RecycleBin } from './pages/RecycleBin';
import { Target } from './pages/Target';
import { TargetProvider } from './context/TargetContext';

export type Page =
  | 'dashboard' | 'transactions' | 'manual-review' | 'pending-advise'
  | 'import' | 'rules' | 'settings' | 'profile' | 'history' | 'recycle-bin'
  | 'target';

const ALL_PAGES: Page[] = [
  'dashboard', 'transactions', 'manual-review', 'pending-advise',
  'import', 'rules', 'settings', 'profile', 'history', 'recycle-bin', 'target',
];

const PAGE_TITLES: Record<Page, string> = {
  dashboard:        'Collection Dashboard',
  transactions:     'Transactions',
  'manual-review':  'Manual Review',
  'pending-advise': 'Pending Payment Advise',
  import:           'Import Bank Statement',
  rules:            'Rule Manager',
  settings:         'Settings',
  profile:          'My Profile',
  history:          'Activity History',
  'recycle-bin':    'Recycle Bin',
  target:           'Target vs Actual',
};

function AppShell() {
  const { user } = useAuth();

  const [page, setPage] = useState<Page>(() => {
    const saved = localStorage.getItem('delta_last_page') as Page | null;
    return (saved && ALL_PAGES.includes(saved)) ? saved : 'dashboard';
  });
  const [pageHistory, setPageHistory] = useState<Page[]>([]);
  const [visited, setVisited] = useState<Set<Page>>(new Set([
    (localStorage.getItem('delta_last_page') as Page | null) ?? 'dashboard'
  ]));
  const [collapsed, setCollapsed] = useState(false);

  if (!user) return <Login />;

  function navigateTo(p: Page) {
    setPageHistory(h => [...h, page]);
    setPage(p);
    setVisited(v => { const n = new Set(v); n.add(p); return n; });
    localStorage.setItem('delta_last_page', p);
  }

  function goBack() {
    setPageHistory(h => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      setPage(prev);
      return h.slice(0, -1);
    });
  }

  function renderPage(p: Page) {
    if (!visited.has(p)) return null;
    switch (p) {
      case 'dashboard':      return <Dashboard onNavigate={navigateTo} />;
      case 'transactions':   return <Transactions onNavigate={navigateTo} />;
      case 'manual-review':  return <ManualReview />;
      case 'pending-advise': return <PendingAdvise />;
      case 'import':         return <Import />;
      case 'rules':          return <RuleManager />;
      case 'settings':       return <Settings />;
      case 'profile':        return <Profile />;
      case 'history':        return <History />;
      case 'recycle-bin':   return <RecycleBin />;
      case 'target':         return <Target />;
      default:               return null;
    }
  }

  return (
    <RulesProvider>
      <CustomersProvider>
        <TransactionsProvider>
          <RecycleBinProvider>
            <HistoryProvider>
              <TargetProvider>
                <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
                  <Sidebar current={page} onNavigate={navigateTo} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                    <Topbar title={PAGE_TITLES[page]} canGoBack={pageHistory.length > 0} onGoBack={goBack} onNavigate={navigateTo} />
                    <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                      {ALL_PAGES.map(p => (
                        <div
                          key={p}
                          style={{
                            display: p === page ? 'flex' : 'none',
                            flexDirection: 'column',
                            position: 'absolute',
                            inset: 0,
                            overflowY: 'auto',
                            padding: '20px',
                          }}
                        >
                          {renderPage(p)}
                        </div>
                      ))}
                    </main>
                  </div>
                </div>
              </TargetProvider>
            </HistoryProvider>
          </RecycleBinProvider>
        </TransactionsProvider>
      </CustomersProvider>
    </RulesProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
