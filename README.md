# Alpha Freight Network TMS

Transportation management system at **tms.alphasolutions.software** — dispatcher, carrier, and driver portals sharing Supabase with Alpha Portal.

## Roles

| Role | Access |
|------|--------|
| **Super Dispatcher** | Full load CRUD, approve sub-dispatcher changes |
| **Sub Dispatcher** | Book loads; edits require super approval |
| **Carrier** | View assigned loads |
| **Driver** | View assigned loads |

## Quick start

```bash
cd TMS
cp .env.example .env.local
# Fill Supabase keys (same as Portal)
npm install
npm run dev
```

Open http://localhost:3002

## Docs

- [PLAN.md](./PLAN.md) — architecture & phased roadmap
- [DEPLOY.md](./DEPLOY.md) — Vercel + Supabase setup
- [supabase/tms-schema.sql](./supabase/tms-schema.sql) — database schema

## Repo

https://github.com/Alpha-Solutions-Services/TMS
