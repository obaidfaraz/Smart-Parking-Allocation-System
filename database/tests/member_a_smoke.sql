\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
    v_area UUID;
    v_slot UUID;
    v_driver UUID;
    v_vehicle UUID;
    v_allocation UUID;
    v_fee NUMERIC(10, 2);
    v_status VARCHAR(20);
    v_duplicate_rejected BOOLEAN := FALSE;
BEGIN
    INSERT INTO parking_areas (name, code, address, city, hourly_rate, total_slots)
    VALUES ('Smoke Test Area', 'SMOKE-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)),
            '1 Test Street', 'Bengaluru', 30.00, 1)
    RETURNING area_id INTO v_area;

    INSERT INTO parking_slots (area_id, slot_number, slot_type)
    VALUES (v_area, 'SMOKE-01', 'standard')
    RETURNING slot_id INTO v_slot;

    INSERT INTO drivers (first_name, last_name, email, phone, license_number)
    VALUES ('Smoke', 'Test', gen_random_uuid()::TEXT || '@example.test',
            '+91' || floor(random() * 1000000000)::BIGINT::TEXT,
            'SMK-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)))
    RETURNING driver_id INTO v_driver;

    INSERT INTO vehicles (license_plate, vehicle_type)
    VALUES ('SMOKE-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)), 'car')
    RETURNING vehicle_id INTO v_vehicle;

    INSERT INTO driver_vehicles (driver_id, vehicle_id, is_primary)
    VALUES (v_driver, v_vehicle, TRUE);

    INSERT INTO allocations (slot_id, vehicle_id, driver_id, check_in_time, status)
    VALUES (v_slot, v_vehicle, v_driver, NOW() - INTERVAL '61 minutes', 'active')
    RETURNING allocation_id INTO v_allocation;

    SELECT current_status INTO v_status FROM parking_slots WHERE slot_id = v_slot;
    IF v_status <> 'occupied' THEN
        RAISE EXCEPTION 'Active allocation did not occupy its slot.';
    END IF;

    BEGIN
        INSERT INTO allocations (slot_id, vehicle_id, driver_id, status)
        VALUES (v_slot, v_vehicle, v_driver, 'active');
    EXCEPTION
        WHEN unique_violation OR raise_exception THEN
            v_duplicate_rejected := TRUE;
    END;
    IF NOT v_duplicate_rejected THEN
        RAISE EXCEPTION 'A duplicate active allocation was accepted.';
    END IF;

    SELECT calculate_parking_fee(NOW() - INTERVAL '61 minutes', NOW(), 30.00)
      INTO v_fee;
    IF v_fee <> 60.00 THEN
        RAISE EXCEPTION 'Expected a two-hour charge of 60.00, got %.', v_fee;
    END IF;

    UPDATE allocations
       SET status = 'checked_out',
           actual_check_out_time = NOW(),
           total_fee = v_fee
     WHERE allocation_id = v_allocation;

    SELECT current_status INTO v_status FROM parking_slots WHERE slot_id = v_slot;
    IF v_status <> 'available' THEN
        RAISE EXCEPTION 'Checked-out allocation did not release its slot.';
    END IF;
END;
$$;

ROLLBACK;
