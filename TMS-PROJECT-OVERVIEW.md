# Alpha Freight TMS — Project Overview

**Live URL:** [tms.alphasolutions.software](https://tms.alphasolutions.software)  
**Repo:** [Alpha-Solutions-Services/TMS](https://github.com/Alpha-Solutions-Services/TMS)  
**Stack:** Next.js 14 · Supabase (auth + Postgres + storage) · Vercel · Groq AI · SMTP email

---

## What this app is

Alpha Freight TMS is a transportation management portal for **Alpha Solutions LLC**. It connects dispatchers, carriers, and drivers on one platform: load booking, carrier/driver management, messaging, document handling, invoicing, and AI-assisted workflows.

---

## Role hierarchy

| Role | Access |
|------|--------|
| **Super Dispatcher** | Full access: team invites, role changes, assignments, carriers, drivers, loads, invoices, approvals, all contact info |
| **Dispatcher** | Assigned carriers/drivers only; names visible (no email/phone); loads, chat, documents |
| **Sub Dispatcher** | Same portal login as dispatcher; typically books loads (super approval where configured); assigned accounts only |
| **Carrier** | Own fleet, loads, documents, chat with dispatch |
| **Driver** | Assigned loads, chat, document uploads |

Super dispatchers are defined via `SUPER_DISPATCHER_EMAILS` env var (comma-separated).

---

## Main portals & routes

### Dispatcher (`/dispatcher/*`)
- **Dashboard** — KPIs, carrier roster, driver roster, sheet sync
- **Loads** — Create/edit loads, AI paste parser, assign to carriers/drivers
- **Carriers** — Roster, portal carrier management, applications
- **Drivers** — Roster, invites
- **Chat** — Full-screen messaging (load / carrier / group threads) with **Ask Alpha AI** inline in the same thread
- **Team** — Invite dispatchers & sub dispatchers, assign to carriers/drivers, change roles, terminate
- **Invoices** — Generate, send, track payment status
- **Approvals** — Sub-dispatcher load approvals (super)
- **Reports** — Dispatch analytics
- **Academy** — Training/student enrollment (freight dispatch training)

### Carrier (`/carrier/*`)
- Dashboard, loads, drivers, trucks, documents, invoices, payments, compliance, settings, chat

### Driver (`/driver/*`)
- Dashboard (assigned loads), chat, accept-invite flow

### Auth
- `/login` — Role-based login (Dispatcher / Carrier / Driver)
- Google OAuth + email/password

---

## Key features (implemented)

### Team management
- Super dispatcher invites **Dispatcher** or **Sub Dispatcher** by email
- Supabase auth invite + SMTP team email
- Assign team members to **carriers** (profiles) or **drivers** (roster)
- Promote sub dispatcher → dispatcher (or reverse) from Team table
- Terminate access with email notification

### Contact privacy
- Dispatchers and sub dispatchers see **names only** — email and phone hidden in UI and APIs
- Super dispatchers see full contact details
- Chat carrier list filtered to assigned carriers for non-super roles

### Chat & messaging
- Carrier direct messages (email notification to carrier)
- Load-based threads (dispatch + carrier + driver)
- Group threads
- Attachments: PDF, RC, BOL, POD, images via Supabase storage bucket `freight-chat-attachments`
- **Alpha AI** integrated in chat — toggle “Ask Alpha AI” to analyze the active conversation and get dispatch help in the same panel

### AI (Groq)
- **Load board paste parser** — paste lines like `$400 Factoring 193 San Angelo, TX (126) Lubbock, TX 7/21 SB 275 lbs 26 ft - Full` → structured load fields (local parser + Groq fallback)
- **Document parser** — upload RC/BOL/POD PDF or image → extract load fields
- **Alpha AI chat** — dispatcher assistant with optional training notes (super)
- Env: `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VISION_MODEL`

### Invoices
- Generate carrier invoices from dispatch sheet data
- Send via email, track sent/paid status
- Payment notification emails

### Audit log
- Team invite, assign, role change, terminate
- Freight actions logged to `freight_audit_log` (Supabase)

---

## Database (Supabase)

Key tables / migrations in `supabase/`:
- `tms-schema.sql` — core TMS users, carriers, loads
- `tms-dispatcher-assignments.sql` — `assigned_dispatcher_id` on carriers & drivers
- `freight-chat-extensions.sql` — chat messages, attachments
- `freight-audit-messaging.sql` — audit log, AI conversations, dispatcher role enum

Shared Supabase project with Alpha Portal (`profiles`, auth.users).

---

## Environment variables

See `.env.example` and `vercel-env.template`:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side APIs |
| `SUPER_DISPATCHER_EMAILS` | Super dispatcher allowlist |
| `SMTP_*` | Team invites, carrier/driver emails, invoices |
| `GROQ_API_KEY` | AI parse + chat |
| `NEXT_PUBLIC_TMS_URL` | Links in emails |

---

## API structure

Routes live under `/api/freight/*` with rewrites from:
- `/api/dispatcher/*` → `/api/freight/dispatcher/*`
- `/api/carrier/*` → `/api/freight/carrier/*`
- `/api/driver/*` → `/api/freight/driver/*`

Notable endpoints:
- `POST /api/users` — invite team member
- `PATCH /api/users` — change dispatcher/sub role
- `POST /api/users/assign` — assign to carrier/driver
- `POST /api/freight/ai/parse-load` — load board paste
- `POST /api/freight/ai/chat` — Alpha AI (supports chat context)
- `POST /api/freight/chat/upload` — attachment upload

---

## Deployment

- **Hosting:** Vercel (auto-deploy from `main`)
- **Build:** `npm run build` in `TMS/`
- **Migrations:** Run SQL files in Supabase SQL Editor (or via Supabase MCP)

### Post-deploy checklist
1. Set all env vars on Vercel
2. Apply Supabase migrations if not already applied
3. Create storage bucket `freight-chat-attachments` (public or signed URLs per your policy)
4. Configure Supabase Auth email templates / SMTP
5. Test login as super, dispatcher, sub dispatcher, carrier, driver

---

## Project structure (high level)

```
TMS/
├── src/app/
│   ├── dispatcher/     # Dispatcher UI pages
│   ├── carrier/        # Carrier portal
│   ├── driver/         # Driver portal
│   └── api/freight/    # Freight APIs
├── src/components/
│   ├── freight/        # Shared freight UI
│   └── tms/            # Team management
├── src/lib/
│   ├── freight/        # Business logic, email, AI, chat
│   └── tms/            # Roles, auth, permissions, privacy
└── supabase/           # SQL migrations
```

---

## Recent changes (this release)

- Sub dispatcher login fixed (server-side ensure-profile instead of client RLS on `tms_users`)
- Role change dispatcher ↔ sub dispatcher from Team page
- Removed role-rights list from invite emails
- Load paste parser with local fallback + formatted preview UI
- Full-screen unified chat with inline Alpha AI context assistant
- Fixed AI chat “Invalid message” bug (`conversationId: null`)

---

*Generated for Alpha Solutions LLC internal review.*
