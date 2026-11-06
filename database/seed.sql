BEGIN;

INSERT INTO parking_areas (
    area_id, name, code, description, address, city, state, hourly_rate, total_slots
) VALUES
    ('a1000000-0000-4000-8000-000000000001', 'Main Campus', 'DEMO-MAIN',
     'Demonstration parking area', '100 University Road', 'Bengaluru', 'Karnataka', 30.00, 8),
    ('a1000000-0000-4000-8000-000000000002', 'East Annex', 'DEMO-EAST',
     'Demonstration overflow parking area', '12 East Gate Road', 'Bengaluru', 'Karnataka', 20.00, 4)
ON CONFLICT DO NOTHING;

INSERT INTO parking_slots (area_id, slot_number, slot_type, floor_number, row_label)
SELECT 'a1000000-0000-4000-8000-000000000001', slot_number, 'standard', 0, 'A'
FROM unnest(ARRAY['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06', 'A-07', 'A-08']) AS slot_number
ON CONFLICT (area_id, slot_number) DO NOTHING;

INSERT INTO parking_slots (area_id, slot_number, slot_type, floor_number, row_label)
SELECT 'a1000000-0000-4000-8000-000000000002', slot_number, 'standard', 0, 'B'
FROM unnest(ARRAY['B-01', 'B-02', 'B-03', 'B-04']) AS slot_number
ON CONFLICT (area_id, slot_number) DO NOTHING;

INSERT INTO drivers (
    driver_id, first_name, last_name, email, phone, license_number, city, state
) VALUES
    ('d1000000-0000-4000-8000-000000000001', 'Demo', 'Driver',
     'demo.driver@example.test', '+919900000001', 'DEMO-LIC-0001', 'Bengaluru', 'Karnataka'),
    ('d1000000-0000-4000-8000-000000000002', 'Sample', 'User',
     'sample.user@example.test', '+919900000002', 'DEMO-LIC-0002', 'Bengaluru', 'Karnataka')
ON CONFLICT DO NOTHING;

INSERT INTO driver_phones (driver_id, phone_number, is_primary)
SELECT driver_id, phone, TRUE
FROM drivers
WHERE license_number IN ('DEMO-LIC-0001', 'DEMO-LIC-0002')
ON CONFLICT DO NOTHING;

INSERT INTO vehicles (
    vehicle_id, license_plate, make, model, year, color, vehicle_type, registration_number
) VALUES
    ('e1000000-0000-4000-8000-000000000001', 'DEMO-1001', 'Honda', 'City', 2022, 'Blue', 'car', 'DEMO-REG-1001'),
    ('e1000000-0000-4000-8000-000000000002', 'DEMO-2001', 'TVS', 'Jupiter', 2021, 'Grey', 'bike', 'DEMO-REG-2001')
ON CONFLICT DO NOTHING;

INSERT INTO driver_vehicles (driver_id, vehicle_id, is_primary)
SELECT d.driver_id, v.vehicle_id, TRUE
FROM drivers d
CROSS JOIN vehicles v
WHERE (d.license_number, v.license_plate) IN (
    ('DEMO-LIC-0001', 'DEMO-1001'),
    ('DEMO-LIC-0002', 'DEMO-2001')
)
AND NOT EXISTS (
    SELECT 1
    FROM driver_vehicles dv
    WHERE dv.driver_id = d.driver_id
      AND dv.vehicle_id = v.vehicle_id
      AND dv.assigned_to IS NULL
      AND dv.status = 'active'
);

COMMIT;
