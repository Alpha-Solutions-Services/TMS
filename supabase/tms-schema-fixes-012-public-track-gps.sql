-- Extend public load track RPC with optional fresh driver GPS (last 2 hours)
CREATE OR REPLACE FUNCTION public.tms_public_load_track(p_token text, p_zip text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.tms_load_share_links%ROWTYPE;
  v_load public.dispatch_loads%ROWTYPE;
  v_zip4 text;
  v_loc public.tms_driver_locations%ROWTYPE;
  v_location jsonb := NULL;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  v_zip4 := right(regexp_replace(coalesce(p_zip, ''), '[^0-9]', '', 'g'), 4);
  IF length(v_zip4) <> 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_zip');
  END IF;

  SELECT * INTO v_link
  FROM public.tms_load_share_links
  WHERE token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;

  IF v_link.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  IF v_link.zip_last4 <> v_zip4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'zip_mismatch');
  END IF;

  SELECT * INTO v_load
  FROM public.dispatch_loads
  WHERE id = v_link.load_id AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'load_missing');
  END IF;

  IF v_load.assigned_driver_profile_id IS NOT NULL THEN
    SELECT * INTO v_loc
    FROM public.tms_driver_locations
    WHERE driver_profile_id = v_load.assigned_driver_profile_id
      AND updated_at > now() - interval '2 hours'
    LIMIT 1;

    IF FOUND THEN
      v_location := jsonb_build_object(
        'lat', v_loc.lat,
        'lng', v_loc.lng,
        'updatedAt', v_loc.updated_at
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'load', jsonb_build_object(
      'loadNumber', coalesce(v_load.load_number, ''),
      'status', coalesce(v_load.status, ''),
      'pickup', coalesce(v_load.pickup_date_time, ''),
      'delivery', coalesce(v_load.delivery_date_time, ''),
      'lane', coalesce(v_load.states, ''),
      'equipment', coalesce(v_load.truck_trailer, ''),
      'carrierName', coalesce(v_load.company_name, '')
    ),
    'location', v_location,
    'expiresAt', v_link.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tms_public_load_track(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tms_public_load_track(text, text) TO anon, authenticated, service_role;
