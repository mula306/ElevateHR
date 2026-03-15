import { useEffect, useState } from 'react';
import {
  Bell,
  ChevronDown,
  Mail,
  Menu,
  Moon,
  Search,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { navigationSections } from '@/shared/navigation/navigation';
import './DashboardLayout.css';

const defaultUserName = 'Admin User';
const defaultRole = 'Super Administrator';

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
            <button className="header-icon-btn" title="Messages">
              <Mail size={18} />
            </button>
            <button className="header-icon-btn header-icon-btn-badge" title="Notifications">
              <Bell size={18} />
            </button>
            <div className="header-divider" />
            <div className="header-profile">
              <div className="header-avatar">
                <span>AU</span>
              </div>
              <div className="header-user-info">
                <span className="header-user-name">{defaultUserName}</span>
                <span className="header-user-role">{defaultRole}</span>
              </div>
              <ChevronDown size={14} className="header-chevron" />
            </div>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
