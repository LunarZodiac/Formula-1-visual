-- Apply in Supabase SQL Editor after checking that these four functions still
-- have the definitions from migrations 008 and 036. They only refer to atlas
-- tables by schema-qualified names and PostgreSQL built-in functions.
BEGIN;

ALTER FUNCTION atlas.touch_updated_at() SET search_path = '';
ALTER FUNCTION atlas.enforce_travel_route_access_anchor_circuit() SET search_path = '';
ALTER FUNCTION atlas.enforce_travel_route_anchor_after_route_circuit_change() SET search_path = '';
ALTER FUNCTION atlas.enforce_travel_route_anchor_after_anchor_circuit_change() SET search_path = '';

COMMIT;

SELECT p.oid::regprocedure AS function_name, p.proconfig AS settings
FROM pg_proc AS p
WHERE p.oid IN (
  'atlas.touch_updated_at()'::regprocedure,
  'atlas.enforce_travel_route_access_anchor_circuit()'::regprocedure,
  'atlas.enforce_travel_route_anchor_after_route_circuit_change()'::regprocedure,
  'atlas.enforce_travel_route_anchor_after_anchor_circuit_change()'::regprocedure
)
ORDER BY function_name;
