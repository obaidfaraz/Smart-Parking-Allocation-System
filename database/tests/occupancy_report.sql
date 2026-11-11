\set ON_ERROR_STOP on
BEGIN;

-- Controlled capacity-boundary fixtures. All changes roll back.
CREATE TEMP TABLE report_fixtures (area_id UUID, expected BOOLEAN);
WITH inserted AS (
    INSERT INTO parking_areas (name, code, address, city, hourly_rate, total_slots, status)
    VALUES
      ('Report above half', 'RPT-' || substr(gen_random_uuid()::TEXT, 1, 12), 'Test', 'Test', 0, 4, 'active'),
      ('Report exactly half', 'RPT-' || substr(gen_random_uuid()::TEXT, 1, 12), 'Test', 'Test', 0, 4, 'active'),
      ('Report empty', 'RPT-' || substr(gen_random_uuid()::TEXT, 1, 12), 'Test', 'Test', 0, 4, 'active'),
      ('Report inactive', 'RPT-' || substr(gen_random_uuid()::TEXT, 1, 12), 'Test', 'Test', 0, 4, 'inactive')
    RETURNING area_id, name
)
INSERT INTO report_fixtures SELECT area_id, name = 'Report above half' FROM inserted;

INSERT INTO parking_slots (area_id, slot_number, slot_type, current_status)
SELECT pa.area_id, i::TEXT, 'standard', 'occupied'
FROM parking_areas pa JOIN report_fixtures f USING (area_id)
CROSS JOIN generate_series(1, 3) i
WHERE pa.name IN ('Report above half', 'Report inactive')
   OR (pa.name = 'Report exactly half' AND i <= 2);

-- Execute the exact report shipped in queries.sql, not a copied approximation.
CREATE TEMP TABLE report_results AS
SELECT
    pa.area_id,
    pa.name,
    pa.total_slots AS configured_capacity,
    COUNT(ps.slot_id) FILTER (WHERE ps.current_status = 'occupied') AS occupied_slots,
    ROUND(100.0 * COUNT(ps.slot_id) FILTER (WHERE ps.current_status = 'occupied')
          / pa.total_slots, 2) AS occupancy_percent
FROM parking_areas pa
LEFT JOIN parking_slots ps ON ps.area_id = pa.area_id
WHERE pa.status = 'active'
GROUP BY pa.area_id, pa.name, pa.total_slots
HAVING COUNT(ps.slot_id) FILTER (WHERE ps.current_status = 'occupied')
       > pa.total_slots * 0.5
ORDER BY occupancy_percent DESC, pa.name;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM report_fixtures f
        WHERE f.expected <> EXISTS (
            SELECT 1 FROM report_results r WHERE r.area_id = f.area_id
        )
    ) THEN
        RAISE EXCEPTION 'HAVING report boundary test failed';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM report_results r JOIN report_fixtures f USING (area_id)
        WHERE f.expected AND r.occupied_slots = 3 AND r.occupancy_percent = 75.00
    ) THEN
        RAISE EXCEPTION 'HAVING report percentage test failed';
    END IF;
    RAISE NOTICE 'PASS: above-half included; exactly-half, empty and inactive excluded';
END $$;
ROLLBACK;
