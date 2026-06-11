# Local Development

## Prerequisites

- Node.js 24+
- pnpm 10+
- Docker Desktop
- Git

## Start local dependencies

```powershell
pnpm docker:up
```

PostgreSQL creates four local databases on first boot:

- `app_db`
- `order_db`
- `inventory_db`
- `ledger_db`

If you need a clean database, remove the Docker volume:

```powershell
docker compose down -v
docker compose up -d
```

## Start apps and services

```powershell
pnpm dev
```

## Demo store

- Store: `demo-teaware`
- Internal store ID: `00000000-0000-4000-8000-000000000001`
- Admin email: `admin@example.com`

## Email verification

- Configure store SMTP from Admin: `http://localhost:3001`
- Default local SMTP is Mailpit: `localhost:1025`
- View registration emails in Mailpit: `http://localhost:8025`

## Local rule

Do not add real payment, logistics, tax, or cloud secrets to local files. Use `.env.example` only as a template.
