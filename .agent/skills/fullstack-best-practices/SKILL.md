---
name: Fullstack Best Practices (Design & SQL Server)
description: Guidelines for maintaining a consistent design framework on the frontend and using a Dockerized SQL Server for the backend.
---

# Consistent Design Framework

When building or modifying the frontend, always adhere to a consistent and modern design framework:

1. **Design Aesthetics (eHealth Saskatchewan)**:
   - **Colors**: Strictly adhere to the eHealth Saskatchewan brand colors. Primary is Cerulean (`#0098DB`, `hsl(198, 100%, 43%)`), secondary is Algae Green (`#96DEBA`, `hsl(150, 53%, 73%)`). Also define semantic colors: `--color-success`, `--color-warning`, `--color-danger` with matching light background variants (`--color-success-bg`, etc.).
   - **Logo**: Place the application logo (gradient icon + bold app name) prominently at the top of the sidebar. Use a `linear-gradient(135deg, var(--color-primary), #00c6fb)` icon badge with a Lucide icon inside.
   - **Typography**: Load **Inter** from Google Fonts via `<link>` in `index.html`. Use `font-weight: 800` and tight `letter-spacing: -0.02em` for headings.
   - **Feel**: Smooth cubic-bezier transitions (`cubic-bezier(0.4, 0, 0.2, 1)`), subtle card hover elevation, custom scrollbars, and focus ring effects on inputs (`box-shadow: 0 0 0 3px var(--color-primary-light)`).

2. **Styling Guidelines**:
   - Define ALL design tokens in a global `index.css` using CSS custom properties on `:root`.
   - Use external `.css` files per component/layout (e.g., `DashboardLayout.css`, `Dashboard.css`) rather than inline styles. Use className-based styling.
   - Maintain a consistent spacing scale: `--spacing-1` through `--spacing-12` (0.25rem → 3rem).
   - Define reusable utility classes in `index.css`: `.card`, `.button`, `.button-outline`, `.badge`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-primary`, `.data-table`, `.page-header`, `.page-title`.

# Light & Dark Theme System

Every application must support both light and dark themes:

1. **Light Theme** (default): Defined on `:root`. Light sidebar (`--sidebar-bg: var(--color-surface)`), clean white cards, soft shadows.
2. **Dark Theme**: Defined on `[data-theme="dark"]`. Override ALL color tokens including sidebar, surface, text, border, shadow, and semantic badge colors.
3. **Theme Toggle**:
   - Place a Sun/Moon icon button in the top header bar (using Lucide `Sun` and `Moon` icons).
   - Persist the user's preference to `localStorage` (key: `<appname>-theme`).
   - Default to the user's OS preference via `window.matchMedia('(prefers-color-scheme: dark)')`.
   - Apply theme by setting `document.documentElement.setAttribute('data-theme', 'dark' | 'light')` inside a `useEffect`.
4. **Smooth Transitions**: Add `transition: background-color var(--transition-normal), color var(--transition-normal)` on `body`, `.card`, `.sidebar`, `.top-header`, and `.main-content` so theme switches feel polished.

# Mobile Responsiveness

All applications must be fully mobile-ready with a responsive design:

1. **Breakpoints**:
   - `≤1024px` (tablets): Sidebar collapses off-screen. Show a hamburger `<Menu>` icon in the header. Metric grids switch from 4-column to 2-column. Chart grids stack to 1-column.
   - `≤640px` (phones): Metric grids switch to 1-column. Header shrinks. Card padding reduces. Data tables become horizontally scrollable.

2. **Collapsible Sidebar**:
   - On mobile, the sidebar is `position: fixed; transform: translateX(-100%)` by default.
   - A React state `sidebarOpen` toggles the class `sidebar-open` (which sets `transform: translateX(0)`) with box-shadow.
   - Render a `.sidebar-overlay` (semi-transparent backdrop with `backdrop-filter: blur(2px)`) behind the sidebar when open.
   - Clicking a nav link or the overlay closes the sidebar.
   - Include a close `<X>` icon button inside the sidebar header on mobile.

3. **Responsive Grids**: Use dedicated CSS classes (e.g., `.metrics-grid`, `.charts-grid`) with `@media` overrides instead of inline grid styles, so breakpoints work correctly.

4. **Header Adaptations**: At `≤1024px`, hide the user info text (name and role) next to the avatar, keeping only the avatar circle. Reduce search input max-width.

# Standard Frontend Tools

To maintain consistency and development speed, use the following standard toolkit:

1. **Framework**: React + TypeScript via Vite (or Next.js if SSR is required).
2. **Styling**: Vanilla CSS with CSS custom properties. *Do not use Tailwind CSS unless explicitly requested.*
3. **Icons**: **Lucide React** for clean, consistent SVG icons.
4. **Data Visualization**: **Recharts** for bar charts, line graphs, pie/donut charts. Use custom `<Tooltip>` components for premium feel.
5. **Data Tables**: **TanStack Table** (React Table) with `.data-table` CSS class for hover rows, uppercase headers, and status badges.
6. **Forms & Validation**: **React Hook Form** + **Zod** schema validation.
7. **Routing**: **React Router DOM** with `<NavLink>` for active-state sidebar navigation.
8. **Date Handling**: **date-fns** or **dayjs** (avoid Moment.js).
9. **Hosting**: Docker multi-stage build (Node build stage → Nginx serve stage).

# Dashboard Template Architecture

When building a dashboard, follow this proven architectural layout:

1. **Application Shell** (`DashboardLayout.tsx` + `DashboardLayout.css`):
   - **Sidebar** (`<aside>`): Light-themed by default. Logo at top (gradient icon + app name). Navigation links grouped by category labels (e.g., "Main Menu", "Management") with Lucide icons. Active link has a left-edge indicator bar (`::before` pseudo-element). Footer section with Settings and Help links.
   - **Main Wrapper**: Contains the top header and a scrollable `<main>` content area.

2. **Top Header Bar**:
   - Search input with `<Search>` icon and focus ring effect.
   - Theme toggle button (Sun/Moon).
   - Notification icons (`<Mail>`, `<Bell>`) with optional red dot badge via `::after`.
   - User avatar (gradient circle with initials) + name + role + chevron dropdown indicator.
   - Hamburger menu button (hidden on desktop, visible on mobile).

3. **Dashboard Page** (`Dashboard.tsx` + `Dashboard.css`):
   - **Page Header**: Bold title + subtitle + primary action button (e.g., "Add Employee").
   - **Metric Cards** (`.metrics-grid`): 4-column grid of `.card` widgets with icon avatar (colored background), large value, and trend badge (`.badge-success` or `.badge-danger` with ArrowUpRight/ArrowDownRight icons).
   - **Charts Row** (`.charts-grid`): 2fr/1fr grid with a Recharts `<BarChart>` and a `<PieChart>` (donut), each inside a `.card` with `.card-header`.
   - **Data Table**: `.card` wrapping a `<table className="data-table">` rendered via TanStack Table, with avatar initials, semantic status badges, and action icon buttons.

# Backend: Docker & SQL Server

When setting up or modifying the backend, follow these standards for SQL Server via Docker:

1. **Dockerized SQL Server**:
   - Prefer the official Microsoft SQL Server image: `mcr.microsoft.com/mssql/server`.
   - Ensure the `ACCEPT_EULA=Y` environment variable is set.
   - Configure a strong `SA_PASSWORD` using environment variables.
   - Map port `1433` (the default SQL Server port) to the host.
   - Use named volumes for data persistence.

2. **Connection Strings**:
   - Always connect via parameterized environment configurations, never hardcoded.
   - Standard local: `Server=localhost,1433;Database=YourAppDB;User Id=sa;Password=YourStrong!Passw0rd;Encrypt=false;`

3. **Database Initialization**:
   - Implement schema migrations and seed foundational data on fresh containers.

# Standard Backend API Tools

1. **Framework**: **Node.js with Express** or **NestJS**.
2. **Language**: **TypeScript** strictly required.
3. **ORM/Query Builder**: **Prisma** (recommended) or **Drizzle ORM**.
4. **Validation**: **Zod** for all incoming API payloads.
5. **Authentication & Authorization**:
   - Use **Microsoft Entra ID (formerly Azure AD)** for enterprise-grade authentication.
   - Implement **RBAC** via Entra ID App Roles and Group claims.
6. **Error Handling**: Centralized middleware with consistent JSON responses (e.g., `{ success: false, error: { code, message } }`).
7. **Logging**: **Pino** or **Winston** for structured logging.

## Reference Examples

- **Docker Compose**: View `examples/docker-compose.yml` for SQL Server setup.
- **Design Tokens**: View `examples/design-tokens.css` for the baseline design system.
- **Dashboard Layout**: View `examples/DashboardLayout.jsx` for the application shell template.
