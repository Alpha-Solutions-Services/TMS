# Alpha Freight Network TMS — Implementation Plan

**Subdomain:** `tms.alphasolutions.software`  
**Repo:** [Alpha-Solutions-Services/TMS](https://github.com/Alpha-Solutions-Services/TMS)  
**Stack:** Next.js 14 + Supabase (same project as Portal) + same dark/blue theme  
**Brand:** Alpha Freight Network (AFN logo)

---

## Portals & Roles

| Portal | Route | Role | Permissions |
|--------|-------|------|-------------|
| **Super Admin / Super Dispatcher** | `/dispatcher` | `super_dispatcher` | Full load CRUD, approve/reject sub-dispatcher changes, manage carriers & drivers |
| **Sub Dispatcher** | `/dispatcher` | `sub_dispatcher` | Book new loads only; edits & additions create **pending approval** requests |
| **Carrier Portal** | `/carrier` | `carrier` | View assigned loads, update status, upload POD |
| **Driver Portal** | `/driver` | `driver` | View assigned loads, update location/status, upload POD |

---

## Approval Workflow (Sub Dispatcher)

```
Sub dispatcher books load → status: pending_approval (if policy requires)
Sub dispatcher edits load → creates tms_load_approvals row (action: edit)
Sub dispatcher adds load  → creates tms_load_approvals row (action: create)
Super dispatcher reviews  → Approve → applied to tms_loads | Reject → discarded + notify
```

---

## Database (Supabase — new tables, same project)

Run `supabase/tms-schema.sql`:

- `tms_users` — maps auth.users → role (super_dispatcher, sub_dispatcher, carrier, driver)
- `tms_carriers` — carrier company profiles
- `tms_drivers` — driver profiles linked to carriers
- `tms_loads` — load board (origin, destination, rate, equipment, status, assigned carrier/driver)
- `tms_load_approvals` — pending edits/additions from sub dispatchers
- `tms_load_events` — status timeline (booked, dispatched, picked up, delivered, etc.)

RLS: role-based — dispatchers see all loads; carriers/drivers see only assigned loads.

---

## App Structure (copied from PORTAL, adapted)

```
TMS/
├── public/afn-logo.png          ← Alpha Freight Network logo
├── src/
│   ├── app/
│   │   ├── dispatcher/          ← Super + sub dispatcher UI
│   │   ├── carrier/               ← Carrier portal
│   │   ├── driver/                ← Driver portal
│   │   ├── login/
│   │   └── api/
│   │       ├── loads/             ← CRUD + approval queue
│   │       └── approvals/
│   ├── lib/tms/                   ← Role resolution, load helpers
│   └── components/tms/            ← Load board, book form, approval panel
└── supabase/tms-schema.sql
```

**Removed from portal copy (not needed for TMS v1):** Sanity CRM, AI chat, tickets, projects, deals, quotes, contracts, milestones, DM threads.

---

## Environment

```env
NEXT_PUBLIC_TMS_URL=https://tms.alphasolutions.software
NEXT_PUBLIC_SUPABASE_URL=          # same as portal
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # same as portal
SUPABASE_SERVICE_ROLE_KEY=         # same as portal
SUPER_DISPATCHER_EMAILS=           # comma-separated super admins
```

---

## Deployment Checklist

1. Push `TMS/` to [Alpha-Solutions-Services/TMS](https://github.com/Alpha-Solutions-Services/TMS)
2. Vercel: new project, root = `TMS/`, port 3002 locally
3. DNS: CNAME `tms.alphasolutions.software` → Vercel
4. Supabase Auth redirect URLs:
   - `https://tms.alphasolutions.software/auth/callback`
   - `http://localhost:3002/auth/callback`
5. Run `supabase/tms-schema.sql` in Supabase SQL Editor
6. Seed super dispatcher in `tms_users` or via `SUPER_DISPATCHER_EMAILS`

---

## Phase 1 (this scaffold) ✅

- [x] Copy PORTAL → TMS folder
- [x] AFN logo + theme preserved
- [x] Role-based routing (dispatcher / carrier / driver)
- [x] Load booking API with approval gate for sub dispatchers
- [x] Approval queue API for super dispatchers
- [x] Basic dashboard shells per portal

## Phase 2 (after approval)

- [ ] Load detail page + edit form
- [ ] Carrier/driver assignment flow
- [ ] Status updates + POD upload (Supabase Storage)
- [ ] Email notifications on approval/rejection
- [ ] Admin user management UI (invite carriers/drivers)
- [ ] Remove unused portal API routes from TMS

## Phase 3

- [ ] Real-time load board (Supabase Realtime)
- [ ] Mobile-friendly driver app (PWA)
- [ ] Reporting / analytics for super admin

---

**Approve Phase 1 to proceed with deployment, or request changes below.**
