-- The application uses these same shapes for the dashboard and allocation flows.

-- Area occupancy summary (requires database/advanced_features.sql).
SELECT *
FROM parking_area_occupancy
ORDER BY name;

-- Find available slots in active areas.
SELECT
    ps.slot_id,
    pa.name AS area_name,
    ps.slot_number,
    ps.slot_type,
    ps.floor_number,
    pa.hourly_rate
FROM parking_slots ps
JOIN parking_areas pa ON pa.area_id = ps.area_id
WHERE ps.current_status = 'available'
  AND pa.status = 'active'
ORDER BY pa.name, ps.slot_number;

-- Active parking allocations with driver, vehicle and area details.
SELECT
    a.allocation_id,
    a.check_in_time,
    a.expected_check_out_time,
    d.first_name || ' ' || d.last_name AS driver_name,
    v.license_plate,
    pa.name AS area_name,
    ps.slot_number
FROM allocations a
JOIN drivers d ON d.driver_id = a.driver_id
JOIN vehicles v ON v.vehicle_id = a.vehicle_id
JOIN parking_slots ps ON ps.slot_id = a.slot_id
JOIN parking_areas pa ON pa.area_id = ps.area_id
WHERE a.status = 'active'
ORDER BY a.check_in_time DESC;

-- Driver vehicle associations and active primary vehicle.
SELECT
    d.driver_id,
    d.first_name || ' ' || d.last_name AS driver_name,
    v.vehicle_id,
    v.license_plate,
    v.vehicle_type,
    dv.is_primary
FROM drivers d
JOIN driver_vehicles dv ON dv.driver_id = d.driver_id
JOIN vehicles v ON v.vehicle_id = dv.vehicle_id
WHERE dv.status = 'active' AND dv.assigned_to IS NULL
ORDER BY driver_name, dv.is_primary DESC, v.license_plate;

-- Parking revenue is derived from completed allocations.
SELECT
    pa.area_id,
    pa.name,
    COALESCE(SUM(a.total_fee) FILTER (WHERE a.status = 'checked_out'), 0)::NUMERIC(12, 2)
        AS collected_parking_fees
FROM parking_areas pa
LEFT JOIN parking_slots ps ON ps.area_id = pa.area_id
LEFT JOIN allocations a ON a.slot_id = ps.slot_id
GROUP BY pa.area_id
ORDER BY pa.name;

-- Active areas with more than half of their configured capacity occupied.
-- WHERE filters individual areas; HAVING filters the grouped slot counts.
-- Compare against total_slots, not installed-slot count, to use declared capacity.
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
