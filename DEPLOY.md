# Deploy checklist — Alpha Freight Network TMS

## Git (first time)

From the `TMS/` folder:

```bash
git init
git remote add origin https://github.com/Alpha-Solutions-Services/TMS.git
git add .
git commit -m "Initial AFN TMS — dispatcher, carrier, driver portals"
git branch -M main
git push -u origin main
```

## DNS
- [ ] Create CNAME `tms.alphasolutions.software` → Vercel
- [ ] SSL certificate issued

## Vercel
1. Import **`Alpha-Solutions-Services/TMS`** (Next.js, Root Directory: `.`)
2. Add env vars from `.env.example`
3. Deploy
4. **Settings → Domains** → Add `tms.alphasolutions.software`

Local dev: `npm run dev` → http://localhost:3002

## Supabase

1. Run **`supabase/tms-schema.sql`** in SQL Editor
2. **Authentication → URL Configuration** → add:
   - `https://tms.alphasolutions.software/auth/callback`
   - `http://localhost:3002/auth/callback`
3. Seed users in `tms_users` (or rely on `SUPER_DISPATCHER_EMAILS` for super dispatchers)

**Super dispatchers (env):** `mikran.dispatch@gmail.com`, `alphaassistant.alpha@gmail.com`, `muhammadmikran.alpha@gmail.com`

Add sub dispatchers and additional supers via **Dispatcher → Team** after they sign up once.

Example seed (replace UUID with auth.users id):

```sql
INSERT INTO tms_users (id, email, full_name, role)
VALUES ('YOUR-USER-UUID', 'dispatcher@example.com', 'Jane Dispatcher', 'sub_dispatcher');
```

## Smoke tests
- [ ] Super dispatcher login → load board + approval queue
- [ ] Sub dispatcher books load → pending approval
- [ ] Super approves → load status = available
- [ ] Carrier/driver see assigned loads only

See **PLAN.md** for full roadmap and Phase 2 items.
