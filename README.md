# ElevateHR

ElevateHR is a human resources information system for managing employee records, workforce operations, and people analytics from a single application.

The current version provides:

- a React web app with a dashboard shell and routed HR workspaces
- an Express and Prisma API organized by feature modules
- SQL Server running in Docker for local development
- employee APIs and seeded dashboard data to support early product development

## Application purpose

This project is intended to become a central workspace for HR and operations teams to handle:

- employee profiles and lifecycle management
- workforce dashboards and reporting
- payroll and compensation workflows
- recruitment and hiring pipeline support
- performance, calendar, settings, and support modules

At this stage, the dashboard and employee API foundation are in place so the rest of the application can be built on a stable structure.

## Project structure

- `apps/web/src/app`: application entry and router configuration
- `apps/web/src/layouts`: reusable layout shells
- `apps/web/src/pages`: route-level pages grouped by feature
- `apps/web/src/shared`: shared navigation, styles, and cross-page utilities
- `apps/api/src/app`: Express app assembly
- `apps/api/src/modules`: feature-oriented API modules
- `apps/api/src/shared`: shared config, middleware, logging, and Prisma access

## API stack

- Express 5 API
- Prisma 7 with the SQL Server adapter
- Microsoft SQL Server 2022 in Docker
- Seeded employee data and dashboard aggregates

## Key API routes

- `GET /api/health`
- `GET /api/health/ready`
- `GET /api/dashboard`
- `GET /api/employees`
- `GET /api/employees/:id`
- `POST /api/employees`
- `PUT /api/employees/:id`
- `DELETE /api/employees/:id`

## Setup on a new computer from GitHub

If you move this repository to another computer, use the steps below after cloning the repo.

### Prerequisites

- Git
- Node.js 22 or newer
- npm
- Docker Desktop with Docker Compose enabled

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd ElevateHR
```

### 2. Install dependencies

```bash
cd apps/api
npm install
cd ../web
npm install
cd ../..
```

### 3. Create local environment files

1. Create a root `.env` from `.env.example`.
2. Set a strong local value for `SQLSERVER_SA_PASSWORD`.
3. Create `apps/api/.env` from `apps/api/.env.example` if you want to run the API outside Docker.
4. If you use `apps/api/.env`, keep its SQL Server password aligned with the root `.env`.
5. Treat both `.env` files as local machine secrets and do not commit them.
6. If you are not configuring Microsoft Entra ID yet, keep `AUTH_BYPASS=true` for local development.
7. If you want real auth, set `AUTH_BYPASS=false` and fill in `AZURE_TENANT_ID` and `AZURE_CLIENT_ID`.

### 4. Start SQL Server and the API with Docker

```bash
docker compose up --build -d
```

This starts:

- SQL Server on `localhost:1433`
- the API on `http://localhost:4000`

### 5. Seed the database if needed

The Docker API runs `db:push` on startup. If you need to reseed the local database, run:

```bash
cd apps/api
npm run db:seed
```

### 6. Start the web app

Open a second terminal and run:

```bash
cd apps/web
npm run dev
```

The web app runs at `http://localhost:5173`.

### 7. Verify the application

Check these URLs after startup:

- web app: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`
- API readiness: `http://localhost:4000/api/health/ready`
- dashboard API: `http://localhost:4000/api/dashboard`

## Running the API without Docker

If you want to run the API directly on your machine instead of in Docker:

```bash
cd apps/api
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

This requires a working local `apps/api/.env`.

## Useful commands

### API

- `npm run dev` in `apps/api/package.json`
- `npm run build` in `apps/api/package.json`
- `npm run db:generate` in `apps/api/package.json`
- `npm run db:push` in `apps/api/package.json`
- `npm run db:seed` in `apps/api/package.json`

### Web

- `npm run dev` in `apps/web/package.json`
- `npm run build` in `apps/web/package.json`
- `npm run preview` in `apps/web/package.json`
