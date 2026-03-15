import React, { useState, useEffect } from 'react';
import {
  Search, Bell, Mail, ChevronDown, LayoutDashboard,
  Calendar, Users, FileText, Settings, HelpCircle,
  CreditCard, Briefcase, BarChart3, TrendingUp,
  Menu, X, Sun, Moon
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import './DashboardLayout.css';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userName?: string;
  role?: string;
}

export function DashboardLayout({ children, userName = "Admin User", role = "Super Administrator" }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('elevate-theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('elevate-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-shell">
      {/* Mobile Overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'sidebar-overlay-visible' : ''}`}
        onClick={closeSidebar}
      />

      {/* ===== Sidebar ===== */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <TrendingUp size={20} strokeWidth={2.5} />
          </div>
          <span className="sidebar-logo-text">Elevate HR</span>
          {/* Close button for mobile */}
          <button
            className="mobile-menu-btn"
            onClick={closeSidebar}
            style={{ marginLeft: 'auto', display: sidebarOpen ? 'flex' : undefined }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="nav-group-label">Main Menu</div>
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} end onClick={closeSidebar}>
            <LayoutDashboard size={18} /> <span>Dashboard</span>
          </NavLink>
          <NavLink to="/employees" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={closeSidebar}>
            <Users size={18} /> <span>Employees</span>
          </NavLink>
          <NavLink to="/payroll" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={closeSidebar}>
            <CreditCard size={18} /> <span>Payroll</span>
          </NavLink>
          <NavLink to="/performance" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={closeSidebar}>
            <BarChart3 size={18} /> <span>Performance</span>
          </NavLink>

          <div className="nav-group-label">Management</div>
          <NavLink to="/recruitment" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={closeSidebar}>
            <Briefcase size={18} /> <span>Recruitment</span>
          </NavLink>
          <NavLink to="/calendar" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={closeSidebar}>
            <Calendar size={18} /> <span>Calendar</span>
          </NavLink>
          <NavLink to="/reports" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={closeSidebar}>
            <FileText size={18} /> <span>Reports</span>
          </NavLink>
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={closeSidebar}>
            <Settings size={18} /> <span>Settings</span>
          </NavLink>
          <NavLink to="/help" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={closeSidebar}>
            <HelpCircle size={18} /> <span>Help & Support</span>
          </NavLink>
        </div>
      </aside>

      {/* ===== Main Content ===== */}
      <div className="main-wrapper">
        {/* Top Header */}
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} title="Open menu">
              <Menu size={20} />
            </button>
            <div className="header-search">
              <Search size={16} className="header-search-icon" />
              <input type="search" placeholder="Search anything..." className="header-search-input" />
            </div>
          </div>
          <div className="header-actions">
            <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="header-icon-btn" title="Messages">
              <Mail size={18} />
            </button>
            <button className="header-icon-btn header-icon-btn-badge" title="Notifications">
              <Bell size={18} />
            </button>
            <div className="header-divider"></div>
            <div className="header-profile">
              <div className="header-avatar">
                <span>AU</span>
              </div>
              <div className="header-user-info">
                <span className="header-user-name">{userName}</span>
                <span className="header-user-role">{role}</span>
              </div>
              <ChevronDown size={14} className="header-chevron" />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
