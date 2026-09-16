BEGIN;

UPDATE atlas.circuit_travel_pois AS link
SET distance_to_circuit_m = round(ST_Distance(poi.location, circuit.location))::integer,
    updated_at = now()
FROM atlas.tourism_pois AS poi, atlas.circuits AS circuit
WHERE link.poi_id = poi.id
  AND link.circuit_id = circuit.id
  AND link.distance_to_circuit_m IS NULL;

COMMIT;
