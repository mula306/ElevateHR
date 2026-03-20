import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import { getNavigationSections } from '@/shared/navigation/navigation';
import { searchGlobal, type GlobalSearchResultGroup, type GlobalSearchResultItem } from '@/shared/search/search.api';
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

function flattenSearchGroups(groups: GlobalSearchResultGroup[]) {
  return groups.flatMap((group) => group.items);
}

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandResults, setCommandResults] = useState<GlobalSearchResultGroup[]>([]);
  const [commandLoading, setCommandLoading] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
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
  const navigate = useNavigate();
  const navigationSections = getNavigationSections(session?.access?.visibleRoutes);
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const notificationPopoverRef = useRef<HTMLDivElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const commandPaletteRef = useRef<HTMLDivElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    window.localStorage.setItem('elevate-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      commandInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [commandPaletteOpen]);

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
        setNotificationsOpen(false);
      }

      if (event.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          setCommandQuery('');
          setCommandResults([]);
          setCommandError(null);
          searchButtonRef.current?.focus();
        }

        if (notificationsOpen) {
          setNotificationsOpen(false);
          notificationButtonRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, [commandPaletteOpen, notificationsOpen]);

  useEffect(() => {
    if (!commandPaletteOpen || commandQuery.trim().length < 2) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCommandLoading(true);
      setCommandError(null);
      void searchGlobal(commandQuery.trim(), 5)
        .then((result) => {
          setCommandResults(result.groups);
          setActiveResultIndex(0);
        })
        .catch((error) => {
          setCommandError(error instanceof Error ? error.message : 'Unable to search the workspace.');
          setCommandResults([]);
        })
        .finally(() => setCommandLoading(false));
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [commandPaletteOpen, commandQuery]);

  useEffect(() => {
    if (!commandPaletteOpen && !notificationsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        notificationsOpen
        && notificationPopoverRef.current
        && !notificationPopoverRef.current.contains(target)
        && !notificationButtonRef.current?.contains(target)
      ) {
        setNotificationsOpen(false);
      }

      if (
        commandPaletteOpen
        && commandPaletteRef.current
        && !commandPaletteRef.current.contains(target)
        && !searchButtonRef.current?.contains(target)
      ) {
        setCommandPaletteOpen(false);
        setCommandQuery('');
        setCommandResults([]);
        setCommandError(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [commandPaletteOpen, notificationsOpen]);

  const workspaceShortcuts = useMemo<GlobalSearchResultGroup[]>(() => {
    const items = navigationSections.flatMap((section) => (
      section.items.map((item) => ({
        id: item.to,
        type: 'workspace' as const,
        title: item.label,
        subtitle: section.label,
        route: item.to === '/time-off' ? '/time-attendance?tab=leave' : item.to,
        badge: section.label,
      }))
    ));

    return items.length > 0 ? [{ type: 'workspace', label: 'Workspaces', items }] : [];
  }, [navigationSections]);

  const visibleSearchGroups = commandQuery.trim().length >= 2 ? commandResults : workspaceShortcuts;
  const flattenedResults = flattenSearchGroups(visibleSearchGroups);

  const closeSidebar = () => setSidebarOpen(false);

  const closeCommandPalette = () => {
    setCommandPaletteOpen(false);
    setCommandQuery('');
    setCommandResults([]);
    setCommandError(null);
    setActiveResultIndex(0);
  };

  const openCommandPalette = () => {
    setNotificationsOpen(false);
    setCommandError(null);
    setCommandResults([]);
    setCommandPaletteOpen(true);
  };

  const goToResult = (result: GlobalSearchResultItem) => {
    navigate(result.route);
    closeCommandPalette();
  };

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
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} title="Open menu" aria-label="Open menu">
              <Menu size={20} />
            </button>
            <button
              ref={searchButtonRef}
              type="button"
              className="header-search-trigger"
              onClick={openCommandPalette}
              aria-label="Open global search"
            >
              <Search size={16} className="header-search-icon" />
              <span className="header-search-text">Quick search</span>
              <span className="header-search-shortcut">Ctrl K</span>
            </button>
          </div>

          <div className="header-actions">
            <button
              className="theme-toggle"
              onClick={() => setDarkMode((currentValue) => !currentValue)}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              ref={notificationButtonRef}
              className={`header-icon-btn ${inboxSummary?.openCount ? 'header-icon-btn-badge' : ''}`}
              title="Inbox activity"
              aria-label="Inbox activity"
              onClick={() => setNotificationsOpen((currentValue) => !currentValue)}
            >
              <Bell size={18} />
              {inboxSummary?.openCount ? <span className="header-icon-pill">{getBadgeLabel(inboxSummary.openCount)}</span> : null}
            </button>
            {notificationsOpen ? (
              <div ref={notificationPopoverRef} className="header-popover">
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
            <button type="button" className="header-icon-btn" title="Sign out" aria-label="Sign out" onClick={() => { void signOut(); }}>
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {commandPaletteOpen ? (
          <div className="command-palette-backdrop" role="presentation">
            <div
              ref={commandPaletteRef}
              className="command-palette"
              role="dialog"
              aria-modal="true"
              aria-labelledby="command-palette-title"
            >
              <div className="command-palette-header">
                <div>
                  <strong id="command-palette-title">Quick search</strong>
                  <span>Employees, positions, requests, inbox work, learning, and workspaces.</span>
                </div>
                <button type="button" className="header-icon-btn" onClick={closeCommandPalette} aria-label="Close quick search">
                  <X size={18} />
                </button>
              </div>

              <label className="command-palette-input-shell">
                <Search size={16} />
                <input
                  ref={commandInputRef}
                  type="search"
                  value={commandQuery}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setCommandQuery(nextValue);
                    if (nextValue.trim().length < 2) {
                      setCommandResults([]);
                      setCommandError(null);
                      setCommandLoading(false);
                      setActiveResultIndex(0);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setActiveResultIndex((currentValue) => Math.min(currentValue + 1, Math.max(flattenedResults.length - 1, 0)));
                    }

                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActiveResultIndex((currentValue) => Math.max(currentValue - 1, 0));
                    }

                    if (event.key === 'Enter' && flattenedResults[activeResultIndex]) {
                      event.preventDefault();
                      goToResult(flattenedResults[activeResultIndex]);
                    }
                  }}
                  placeholder="Search by employee, position, request number, or workspace"
                />
              </label>

              <div className="command-palette-body">
                {commandLoading ? (
                  <div className="command-palette-state">Searching the workspace...</div>
                ) : commandError ? (
                  <div className="command-palette-state command-palette-state-error">{commandError}</div>
                ) : visibleSearchGroups.length === 0 ? (
                  <div className="command-palette-state">No results match the current search.</div>
                ) : (
                  visibleSearchGroups.map((group) => (
                    <section key={group.type} className="command-palette-group">
                      <div className="command-palette-group-label">{group.label}</div>
                      <div className="command-palette-group-list">
                        {group.items.map((item) => {
                          const resultIndex = flattenedResults.findIndex((candidate) => candidate.id === item.id && candidate.route === item.route);
                          return (
                            <button
                              key={`${item.type}-${item.id}-${item.route}`}
                              type="button"
                              className={`command-palette-result ${resultIndex === activeResultIndex ? 'command-palette-result-active' : ''}`}
                              onClick={() => goToResult(item)}
                            >
                              <div>
                                <div className="command-palette-result-title">{item.title}</div>
                                <div className="command-palette-result-subtitle">{item.subtitle}</div>
                              </div>
                              {item.badge ? <span className="badge badge-primary">{item.badge}</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
