-- Fix: unauthenticated EXECUTE on set_dispatch_load_document_path + tighten
-- related grants. Additive. Do not edit tms-schema.sql / set-load-document-path.sql.
--
-- Call-site audit (repo):
--   TMS/src/lib/freight/load-documents.ts → admin.rpc("set_dispatch_load_document_path", ...)
--   only via getServiceRoleClient(). Used as fallback after service-role
--   .from("dispatch_loads").update(...). Called from
--   TMS/src/app/api/freight/loads/documents/route.ts (auth'd dispatcher API;
--   upload still uses service role client).
--   No user-JWT / anon client .rpc call sites found.
--
-- Therefore: do NOT add tms_user_can_access_load() inside the function body —
-- auth.uid() under service role is null / not the end user, so that check would
-- break or be meaningless. Real control = revoke EXECUTE from anon/public/
-- authenticated; keep service_role only. Function body left unchanged.
--
-- Also defense-in-depth: revoke unnecessary EXECUTE on set_profile_paid_until
-- (trigger fn) and support_ticket_row_status / support_ticket_row_priority
-- (RLS helpers for authenticated).
--
-- NOT TOUCHED (explicit):
--   check_freight_email_registered — flagged, awaiting product decision
--   tms_list_carriers_masked / tms_list_drivers_masked — already internally gated

-- (a) No CREATE OR REPLACE of set_dispatch_load_document_path — body unchanged.

-- (b) Grant tightening
REVOKE EXECUTE ON FUNCTION public.set_dispatch_load_document_path(uuid, text, text)
  FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.set_dispatch_load_document_path(uuid, text, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_profile_paid_until() FROM anon, public;

REVOKE EXECUTE ON FUNCTION public.support_ticket_row_status(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.support_ticket_row_status(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.support_ticket_row_priority(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.support_ticket_row_priority(uuid) TO authenticated;
