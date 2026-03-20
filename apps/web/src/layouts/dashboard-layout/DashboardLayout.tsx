import { useEffect, useState } from 'react';
import {
  Bell,
  ChevronDown,
  Menu,
  Moon,
  Search,
  LogOut,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import { getNavigationSections } from '@/shared/navigation/navigation';
import './DashboardLayout.css';

function getInitials(value: string) {
  return value
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getBadgeLabel(value: number) {
  return value > 99 ? '99+' : value.toLocaleString();
}

function formatShortDate(value: string | null) {
  if (!value) {
    return 'No due date';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: '2-digit',
  }).format(new Date(value));
}

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const savedTheme = window.localStorage.getItem('elevate-theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const {
    session,
    inboxSummary,
    selectedDevAccountId,
    setSelectedDevAccountId,
    signOut,
  } = useAppSession();
  const navigationSections = getNavigationSections(session?.access?.visibleRoutes);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    window.localStorage.setItem('elevate-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-shell">
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'sidebar-overlay-visible' : ''}`}
        onClick={closeSidebar}
      />

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <TrendingUp size={20} strokeWidth={2.5} />
          </div>
          <span className="sidebar-logo-text">Elevate HR</span>
          <button
            className="mobile-menu-btn"
            onClick={closeSidebar}
            style={{ marginLeft: 'auto', display: sidebarOpen ? 'flex' : undefined }}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navigationSections.map((section) => (
            <div key={section.label}>
              <div className="nav-group-label">{section.label}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const badgeValue = item.badgeKey === 'inbox' ? (inboxSummary?.openCount ?? 0) : 0;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                    end={item.to === '/'}
                    onClick={closeSidebar}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {badgeValue > 0 ? <span className="nav-link-badge">{getBadgeLabel(badgeValue)}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-footer-label">People Operations Workspace</span>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="top-header">
          <div className="header-left">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} title="Open menu">
              <Menu size={20} />
            </button>
            <div className="header-search">
              <Search size={16} className="header-search-icon" />
              <input type="search" placeholder="Search employees, reports, or actions" className="header-search-input" />
            </div>
          </div>

          <div className="header-actions">
            <button
              className="theme-toggle"
              onClick={() => setDarkMode((currentValue) => !currentValue)}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className={`header-icon-btn ${inboxSummary?.openCount ? 'header-icon-btn-badge' : ''}`}
              title="Inbox activity"
              onClick={() => setNotificationsOpen((currentValue) => !currentValue)}
            >
              <Bell size={18} />
              {inboxSummary?.openCount ? <span className="header-icon-pill">{getBadgeLabel(inboxSummary.openCount)}</span> : null}
            </button>
            {notificationsOpen ? (
              <div className="header-popover">
                <div className="header-popover-header">
                  <div>
                    <strong>Inbox activity</strong>
                    <span>{(inboxSummary?.openCount ?? 0).toLocaleString()} open items</span>
                  </div>
                  <Link to="/inbox" className="button button-outline dashboard-inline-button" onClick={() => setNotificationsOpen(false)}>
                    Open Inbox
                  </Link>
                </div>
                <div className="header-popover-list">
                  {(inboxSummary?.urgentPreview ?? []).length === 0 ? (
                    <div className="header-popover-empty">No urgent items are waiting.</div>
                  ) : (inboxSummary?.urgentPreview ?? []).map((item) => (
                    <div key={item.id} className="header-popover-row">
                      <div>
                        <div className="header-popover-title">{item.title}</div>
                        <div className="header-popover-meta">{item.sourceType} | Due {formatShortDate(item.dueDate)}</div>
                      </div>
                      <span className="badge badge-warning">{item.assignee.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="header-divider" />
            {session?.dev.enabled ? (
              <label className="header-dev-switcher">
                <span>View as</span>
                <select value={selectedDevAccountId} onChange={(event) => setSelectedDevAccountId(event.target.value)}>
                  <option value="">Default account</option>
                  {session.dev.availableAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="header-profile">
              <div className="header-avatar">
                <span>{getInitials(session?.account?.displayName ?? session?.user?.name ?? 'Elevate HR')}</span>
              </div>
              <div className="header-user-info">
                <span className="header-user-name">{session?.account?.displayName ?? session?.user?.name ?? 'Loading account...'}</span>
                <span className="header-user-role">{session?.account?.employee?.jobTitle ?? session?.user?.roles[0] ?? 'Workspace account'}</span>
              </div>
              <ChevronDown size={14} className="header-chevron" />
            </div>
            <button type="button" className="header-icon-btn" title="Sign out" onClick={() => { void signOut(); }}>
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
