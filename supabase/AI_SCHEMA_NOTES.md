# AI schema notes — Alpha Freight TMS

Keep Supabase readable for humans and Ask Alpha. Prefer typed `tms_*` tables; never dump share tokens or raw OCR blobs into AI prompts.

## Phase 1 live tables
| Table / object | Purpose |
|----------------|---------|
| `tms_load_share_links` | Public Live Share tokens + zip_last4 gate |
| `tms_public_load_track(token, zip)` | SECURITY DEFINER RPC — sanitized track payload |
| `tms_rate_confirmations` | Per-load rate confirmation e-sign |
| `tms_carrier_agreements` | Carrier onboarding agreements (existing) |

## Phase 2–3 live (UI + APIs)
| Feature | Entry |
|---------|-------|
| POD/BOL/RC OCR | Auto after `POST /api/freight/loads/documents` → `tms_document_extractions` |
| Carrier scorecard | Dashboard KPIs from `tms_ai_carrier_scorecard` |
| Announcements | Dispatcher Alerts + carrier dashboard banner |
| Compliance reminders | Cron `/api/cron/compliance-reminders` (daily 14:00 UTC) |
| Referrals | `/carrier/referrals` + `/dispatcher/advances` |
| Community | `/carrier/community` |
| Lumper / advances | `/carrier/advances` + `/dispatcher/advances` |

## Compliance profile columns
`profiles.insurance_expires_at`, `ifta_due_at`, `registration_expires_at` — used by compliance cron.

## AI-safe views only (use in `buildTmsAiContext`)
| View | Contents |
|------|----------|
| `tms_ai_carrier_scorecard` | load_count, delivered_count, avg_dispatch_percent |
| `tms_ai_active_announcements` | title + body_preview |
| `tms_ai_open_advances` | pending/approved advances |

## Rules
1. Prefix new tables `tms_*`.
2. RLS default deny; staff APIs use service role.
3. Public access only via RPC or single-token routes — never `anon` SELECT on `dispatch_loads`.
4. AI context: summaries from `tms_ai_*` views only — no tokens, referral codes, or full OCR JSON.
5. Migrations: additive files under `supabase/tms-schema-fixes-*.sql`.

## Public / carrier routes
- Track: `/track/[token]` + `POST /api/freight/public/track`
- Rate con: `/carrier/rate-con/[token]` (PDF emailed to supers on accept)
- Dispatcher create: `/api/dispatcher/share-links`, `/api/dispatcher/rate-confirmations`
