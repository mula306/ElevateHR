---
name: Fullstack Best Practices (Design & SQL Server)
description: Guidelines for maintaining a consistent design framework on the frontend and using a Dockerized SQL Server for the backend.
---

# Project Architecture & Structure

When building human resources or enterprise applications, use a modular monorepo-style structure to keep the API and Web applications synchronized:

1.  **Directory Structure**:
    - `apps/api`: Express or NestJS backend.
    - `apps/web`: React or Next.js frontend.
    - `docs`: Architecture and API documentation.
    - `.env.example`: Root-level template for shared variables (DB passwords, ports).

2.  **Environment Management**:
    - Use a **root `.env`** for variables shared across containers (e.g., `SQLSERVER_SA_PASSWORD`).
    - Use **app-specific `.env`** files (e.g., `apps/api/.env`) for running services locally outside of Docker.
    - Always include `.env.example` files and never commit actual `.env` files.

# Consistent Design Framework

When building or modifying the frontend, always adhere to a consistent and modern design framework:

1.  **Design Aesthetics (eHealth Saskatchewan)**:
    - **Colors**: Strictly adhere to the eHealth Saskatchewan brand colors. Primary is Cerulean (`#0098DB`, `hsl(198, 100%, 43%)`), secondary is Algae Green (`#58A618`, `hsl(93, 75%, 37%)`). Also define semantic colors: `--color-success`, `--color-warning`, `--color-danger` with matching light background variants (`--color-success-bg`, etc.).
    - **Logo**: Place the application logo (gradient icon + bold app name) prominently at the top of the sidebar. Use a `linear-gradient(135deg, var(--color-primary), #00c6fb)` icon badge with a Lucide icon inside.
    - **Typography**: Load **Inter** from Google Fonts via `<link>` in `index.html`. Use `font-weight: 800` and tight `letter-spacing: -0.02em` for headings.
    - **Feel**: Smooth cubic-bezier transitions (`cubic-bezier(0.4, 0, 0.2, 1)`), subtle card hover elevation, custom scrollbars, and focus ring effects on inputs (`box-shadow: 0 0 0 3px var(--color-primary-light)`).

2.  **Styling Guidelines**:
    - Define ALL design tokens in a global `index.css` using CSS custom properties on `:root`.
    - Use external `.css` files per component/layout (e.g., `DashboardLayout.css`, `Dashboard.css`) rather than inline styles. Use className-based styling.
    - Maintain a consistent spacing scale: `--spacing-1` through `--spacing-12` (0.25rem → 3rem).
    - Define reusable utility classes in `index.css`: `.card`, `.button`, `.button-outline`, `.badge`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-primary`, `.data-table`, `.page-header`, `.page-title`.

# Light & Dark Theme System

Every application must support both light and dark themes:

1.  **Light Theme** (default): Defined on `:root`. Light sidebar (`--sidebar-bg: var(--color-surface)`), clean white cards, soft shadows.
2.  **Dark Theme**: Defined on `[data-theme="dark"]`. Override ALL color tokens including sidebar, surface, text, border, shadow, and semantic badge colors.
3.  **Theme Toggle**:
    - Place a Sun/Moon icon button in the top header bar (using Lucide `Sun` and `Moon` icons).
    - Persist the user's preference to `localStorage` (key: `<appname>-theme`).
    - Default to the user's OS preference via `window.matchMedia('(prefers-color-scheme: dark)')`.
    - Apply theme by setting `document.documentElement.setAttribute('data-theme', 'dark' | 'light')` inside a `useEffect`.

# Mobile Responsiveness

All applications must be fully mobile-ready with a responsive design:

1.  **Breakpoints**:
    - `≤1024px` (tablets): Sidebar collapses off-screen. Show a hamburger `<Menu>` icon in the header. Metric grids switch from 4-column to 2-column. Chart grids stack to 1-column.
    - `≤640px` (phones): Metric grids switch to 1-column. Header shrinks. Card padding reduces. Data tables become horizontally scrollable.

2.  **Collapsible Sidebar**:
    - On mobile, the sidebar is `position: fixed; transform: translateX(-100%)` by default.
    - A React state `sidebarOpen` toggles the class `sidebar-open` (which sets `transform: translateX(0)`) with box-shadow.
    - Render a `.sidebar-overlay` (semi-transparent backdrop with `backdrop-filter: blur(2px)`) behind the sidebar when open.

# Dashboard Template Architecture

When building a dashboard, follow this proven architectural layout:

1.  **Application Shell** (`DashboardLayout.tsx`):
    - **Sidebar** (`<aside>`): Logo at top. Navigation links grouped by category labels. Active link indicator.
    - **Top Header Bar**: Search input, Theme toggle, Notification icons, User avatar/profile.

2.  **Dashboard Page** (`Dashboard.tsx`):
    - **Page Header**: Bold title + subtitle + primary action button.
    - **Metric Cards**: 4-column grid of widgets with icon avatars and trend badges.
    - **Charts Row**: 2fr/1fr grid with Bar and Pie charts.

# Backend: SQL Server & Prisma

1.  **Dockerized SQL Server**:
    - Use `mcr.microsoft.com/mssql/server:2022-latest`.
    - Set `ACCEPT_EULA=Y` and `SA_PASSWORD` from environment variables.
    - **Healthcheck**: Implement a `sqlcmd` healthcheck in `docker-compose.yml` to ensure the API only starts after the DB is ready.

2.  **API Orchestration**:
    - Use `docker-compose` to run both the database and the API.
    - Use `depends_on` with `condition: service_healthy` for the database dependency.
    - Inject connection strings via `DATABASE_URL` environment variables.

3.  **Prisma Workflow**:
    - **Generate**: `npx prisma generate` to create the type-safe client.
    - **Push**: `npx prisma db push` for rapid local schema prototyping.
    - **Seed**: Use a robust `seed.ts` script to populate the database with realistic dashboard and employee data.

4.  **Local Development Strategy**:
    - **AUTH_BYPASS**: Use an `AUTH_BYPASS=true` flag to allow development without a live Microsoft Entra ID connection.
    - **Health Endpoints**: Implement `/api/health` and `/api/health/ready` to support Docker healthchecks and monitoring.

# Standard Tools

- **Frontend**: React, TypeScript, Vite, Vanilla CSS, Lucide Icons, Recharts, TanStack Table.
- **Backend**: Node.js, Express, TypeScript, Prisma, SQL Server.
- **DevOps**: Docker, Docker Compose, GitHub Actions.

## Reference Examples

- **Full Docker Orchestration**: View `examples/docker-compose.yml` for an API + SQL Server setup.
- **Design Tokens**: View `examples/design-tokens.css` for the baseline design system.
- **Dashboard Layout**: View `examples/DashboardLayout.jsx` for the application shell template.
