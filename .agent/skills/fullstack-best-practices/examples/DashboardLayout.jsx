import React from 'react';
import { Search, Bell, LayoutDashboard, Calendar, Users, FileText, ChevronDown } from 'lucide-react';
import './design-tokens.css';

/**
 * Standard eHealth Saskatchewan Dashboard Layout Shell
 * Use this as a wrapper for generic authenticated dashboard pages.
 */
export function DashboardLayout({ children, userName = "User Name", role = "Administrator" }) {
  return (
    <div className="dashboard-layout" style={styles.layout}>
      {/* Sidebar Navigation */}
      <aside className="dashboard-sidebar" style={styles.sidebar}>
        <div className="sidebar-logo" style={styles.logoContainer}>
          {/* Replace with actual eHealth logo SVG */}
          <div style={styles.logoPlaceholder}>
            <span style={{ color: 'var(--color-primary)', fontWeight: 'bold', fontSize: '1.25rem' }}>eHealth</span>
            <span style={{ color: 'var(--color-secondary)' }}> Sask</span>
          </div>
        </div>
        
        <nav className="sidebar-nav" style={styles.nav}>
          <div style={styles.navGroup}>MAIN MENU</div>
          <a href="#" style={{...styles.navItem, ...styles.navItemActive}}>
            <LayoutDashboard size={20} /> Dashboard
          </a>
          <a href="#" style={styles.navItem}>
            <FileText size={20} /> Tasks
          </a>
          <a href="#" style={styles.navItem}>
            <Calendar size={20} /> Calendar
          </a>
          <a href="#" style={styles.navItem}>
            <Users size={20} /> Employees
          </a>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-main" style={styles.main}>
        {/* Top Header */}
        <header className="dashboard-header" style={styles.header}>
          <div className="header-search" style={styles.searchContainer}>
            <Search size={18} color="var(--color-text-muted)" style={{ position: 'absolute', left: '12px' }} />
            <input 
              type="search" 
              placeholder="Search anything..." 
              style={styles.searchInput}
            />
          </div>
          <div className="header-actions" style={styles.actionsContainer}>
            <button style={styles.iconButton}><Bell size={20} /></button>
            <div className="user-profile" style={styles.profileContainer}>
              <div style={styles.avatar}></div>
              <div style={styles.userInfo}>
                <span style={styles.userName}>{userName}</span>
                <span style={styles.userRole}>{role}</span>
              </div>
              <ChevronDown size={16} color="var(--color-text-muted)" />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="dashboard-content" style={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
}

const styles = {
  layout: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: 'var(--color-background)'
  },
  sidebar: {
    width: '260px',
    backgroundColor: 'var(--color-surface)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    padding: 'var(--spacing-6) 0'
  },
  logoContainer: {
    padding: '0 var(--spacing-6) var(--spacing-8) var(--spacing-6)',
    display: 'flex',
    alignItems: 'center'
  },
  logoPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-2)',
    padding: '0 var(--spacing-4)'
  },
  navGroup: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: 'var(--spacing-4) var(--spacing-2) var(--spacing-2) var(--spacing-2)'
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-3)',
    padding: 'var(--spacing-2) var(--spacing-3)',
    color: 'var(--color-text-muted)',
    textDecoration: 'none',
    borderRadius: 'var(--border-radius-md)',
    fontWeight: '500',
    transition: 'all var(--transition-fast)'
  },
  navItemActive: {
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-text-main)',
    fontWeight: '600'
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  header: {
    height: '72px',
    backgroundColor: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 var(--spacing-8)'
  },
  searchContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '320px'
  },
  searchInput: {
    width: '100%',
    padding: 'var(--spacing-2) var(--spacing-4) var(--spacing-2) var(--spacing-12)',
    borderRadius: 'var(--border-radius-md)',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-background)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-main)',
    outline: 'none'
  },
  actionsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-6)'
  },
  iconButton: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-3)',
    cursor: 'pointer'
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-primary)',
    backgroundImage: 'url("https://i.pravatar.cc/150?u=a042581f4e29026024d")',
    backgroundSize: 'cover'
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  },
  userName: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: '600',
    color: 'var(--color-text-main)',
    lineHeight: '1.2'
  },
  userRole: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    lineHeight: '1.2'
  },
  content: {
    flex: 1,
    padding: 'var(--spacing-8)',
    overflowY: 'auto'
  }
};
