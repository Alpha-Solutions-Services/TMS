-- Fix: check_freight_email_registered had EXECUTE granted to anon/authenticated,
-- enabling email enumeration via direct PostgREST RPC calls. Call-site audit
-- confirmed zero legitimate anon/authenticated callers — all real usage goes
-- through getServiceRoleClient() in TMS/LEARN-DISPATCH signup flows. This
-- mirrors the set_dispatch_load_document_path fix (tms-schema-fixes-004):
-- revoke unnecessary grants, function body unchanged.
--
-- Additive. Apply once on shared DB.

REVOKE EXECUTE ON FUNCTION public.check_freight_email_registered(text)
  FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.check_freight_email_registered(text)
  TO service_role;
