-- Persist load document paths even when PostgREST RLS/schema cache blocks direct updates
CREATE OR REPLACE FUNCTION public.set_dispatch_load_document_path(
  p_load_id uuid,
  p_type text,
  p_path text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count int;
BEGIN
  IF p_type = 'rate_con' THEN
    UPDATE dispatch_loads SET rate_con_path = p_path WHERE id = p_load_id AND deleted_at IS NULL;
  ELSIF p_type = 'bol' THEN
    UPDATE dispatch_loads SET bol_path = p_path WHERE id = p_load_id AND deleted_at IS NULL;
  ELSIF p_type = 'commodity' THEN
    UPDATE dispatch_loads SET commodity_path = p_path WHERE id = p_load_id AND deleted_at IS NULL;
  ELSIF p_type = 'pod' THEN
    UPDATE dispatch_loads SET pod_path = p_path WHERE id = p_load_id AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Invalid document type: %', p_type;
  END IF;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.set_dispatch_load_document_path(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_dispatch_load_document_path(uuid, text, text) TO service_role;
