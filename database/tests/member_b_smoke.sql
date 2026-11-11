\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
    v_area UUID;
    v_driver UUID;
    v_vehicle_one UUID;
    v_vehicle_two UUID;
    v_vehicle_three UUID;
    v_slot_one UUID;
    v_slot_two UUID;
    v_slot_three UUID;
    v_allocation_one UUID;
    v_allocation_two UUID;
    v_parking_allocation UUID;
    v_violation_one UUID;
    v_violation_two UUID;
    v_violation_type INTEGER;
    v_payment UUID;
    v_parking_payment UUID;
    v_notice UUID;
    v_duplicate_notice UUID;
    v_dispute_notice UUID;
    v_status VARCHAR(25);
    v_payment_status VARCHAR(20);
    v_rejected BOOLEAN := FALSE;
BEGIN
    INSERT INTO parking_areas (name, code, address, city, hourly_rate, total_slots)
    VALUES ('Member B Smoke Area', 'SMKB-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)),
            '2 Test Street', 'Bengaluru', 25.00, 3)
    RETURNING area_id INTO v_area;

    INSERT INTO parking_slots (area_id, slot_number, slot_type)
    VALUES (v_area, 'SMKB-01', 'standard')
    RETURNING slot_id INTO v_slot_one;
    INSERT INTO parking_slots (area_id, slot_number, slot_type)
    VALUES (v_area, 'SMKB-02', 'standard')
    RETURNING slot_id INTO v_slot_two;
    INSERT INTO parking_slots (area_id, slot_number, slot_type)
    VALUES (v_area, 'SMKB-03', 'standard')
    RETURNING slot_id INTO v_slot_three;

    INSERT INTO drivers (first_name, last_name, email, phone, license_number)
    VALUES ('Member', 'BTest', gen_random_uuid()::TEXT || '@example.test',
            '+91' || floor(random() * 1000000000)::BIGINT::TEXT,
            'SMKB-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)))
    RETURNING driver_id INTO v_driver;

    INSERT INTO vehicles (license_plate, vehicle_type)
    VALUES ('SMKB-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)), 'car')
    RETURNING vehicle_id INTO v_vehicle_one;
    INSERT INTO vehicles (license_plate, vehicle_type)
    VALUES ('SMKB-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)), 'car')
    RETURNING vehicle_id INTO v_vehicle_two;
    INSERT INTO vehicles (license_plate, vehicle_type)
    VALUES ('SMKB-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)), 'car')
    RETURNING vehicle_id INTO v_vehicle_three;

    INSERT INTO driver_vehicles (driver_id, vehicle_id, is_primary)
    VALUES (v_driver, v_vehicle_one, TRUE),
           (v_driver, v_vehicle_two, FALSE),
           (v_driver, v_vehicle_three, FALSE);

    INSERT INTO allocations (slot_id, vehicle_id, driver_id, status)
    VALUES (v_slot_one, v_vehicle_one, v_driver, 'active')
    RETURNING allocation_id INTO v_allocation_one;
    INSERT INTO allocations (slot_id, vehicle_id, driver_id, status)
    VALUES (v_slot_two, v_vehicle_two, v_driver, 'active')
    RETURNING allocation_id INTO v_allocation_two;
    INSERT INTO allocations (
        slot_id, vehicle_id, driver_id, check_in_time, actual_check_out_time,
        status, total_fee
    ) VALUES (
        v_slot_three, v_vehicle_three, v_driver, NOW() - INTERVAL '1 hour',
        NOW(), 'checked_out', 40.00
    )
    RETURNING allocation_id INTO v_parking_allocation;

    INSERT INTO violation_types (name, description, default_fine, severity)
    VALUES ('Member B smoke ' || upper(substr(gen_random_uuid()::TEXT, 1, 8)),
            'Transactional smoke-test violation.', 25.00, 'low')
    RETURNING violation_type_id INTO v_violation_type;

    v_violation_one := create_violation_for_allocation(
        v_allocation_one, v_violation_type, 'Smoke-test violation one.'
    );
    v_violation_two := create_violation_for_allocation(
        v_allocation_two, v_violation_type, 'Smoke-test violation two.'
    );

    v_notice := create_notice_for_violation(
        v_violation_one, 'fine_notice', 'Smoke test fine notice',
        'Notice creation and duplicate prevention check.', NULL, 'smoke:fine:one'
    );
    v_duplicate_notice := create_notice_for_violation(
        v_violation_one, 'fine_notice', 'Smoke test fine notice',
        'Notice creation and duplicate prevention check.', NULL, 'smoke:fine:one'
    );
    IF v_notice <> v_duplicate_notice THEN
        RAISE EXCEPTION 'Duplicate notice event created a second notice.';
    END IF;
    IF (
        SELECT COUNT(*)
          FROM audit_outbox
         WHERE aggregate_type = 'notices'
           AND aggregate_id = v_notice
           AND event_type = 'notice_generated'
    ) <> 1 THEN
        RAISE EXCEPTION 'Duplicate notice event created duplicate audit events.';
    END IF;

    UPDATE violations SET status = 'disputed' WHERE violation_id = v_violation_two;
    v_dispute_notice := create_notice_for_violation(
        v_violation_two, 'dispute_notice', 'Smoke test dispute notice',
        'The driver has disputed this violation.', NULL, 'smoke:dispute:two'
    );
    IF NOT EXISTS (
        SELECT 1 FROM notices
         WHERE notice_id = v_dispute_notice
           AND notice_type = 'dispute_notice'
           AND status = 'sent'
    ) THEN
        RAISE EXCEPTION 'A dispute notice was not created.';
    END IF;
    UPDATE violations SET status = 'open' WHERE violation_id = v_violation_two;

    INSERT INTO payments (driver_id, payment_method, amount, payment_status)
    VALUES (v_driver, 'cash', 50.00, 'pending')
    RETURNING payment_id INTO v_payment;

    PERFORM apply_payment_to_violation(v_violation_one, v_payment, 25.00);
    PERFORM apply_payment_to_violation(v_violation_two, v_payment, 25.00);

    SELECT payment_status INTO v_payment_status
      FROM payments WHERE payment_id = v_payment;
    IF v_payment_status <> 'success' THEN
        RAISE EXCEPTION 'A fully allocated multi-violation payment was not marked successful.';
    END IF;

    SELECT status INTO v_status FROM violations WHERE violation_id = v_violation_one;
    IF v_status <> 'paid' THEN
        RAISE EXCEPTION 'A fully paid violation was not marked paid.';
    END IF;

    SELECT status INTO v_status FROM notices WHERE notice_id = v_notice;
    IF v_status <> 'paid' THEN
        RAISE EXCEPTION 'A fine notice was not marked paid when its violation was settled.';
    END IF;

    INSERT INTO payments (
        driver_id, vehicle_id, allocation_id, payment_category,
        payment_method, amount, payment_status, paid_at
    ) VALUES (
        v_driver, v_vehicle_three, v_parking_allocation, 'parking_fee',
        'cash', 40.00, 'success', NOW()
    )
    RETURNING payment_id INTO v_parking_payment;

    BEGIN
        INSERT INTO payments (
            driver_id, vehicle_id, allocation_id, payment_category,
            payment_method, amount, payment_status, paid_at
        ) VALUES (
            v_driver, v_vehicle_three, v_parking_allocation, 'parking_fee',
            'cash', 0.01, 'success', NOW()
        );
    EXCEPTION
        WHEN raise_exception THEN
            v_rejected := TRUE;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'Parking-fee overpayment was accepted.';
    END IF;

    v_rejected := FALSE;
    BEGIN
        PERFORM apply_payment_to_violation(v_violation_one, v_parking_payment, 1.00);
    EXCEPTION
        WHEN raise_exception THEN
            v_rejected := TRUE;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'A parking payment was incorrectly applied to a violation.';
    END IF;

    UPDATE allocations
       SET status = 'checked_out',
           actual_check_out_time = NOW()
     WHERE allocation_id = v_allocation_one;
    v_rejected := FALSE;
    BEGIN
        PERFORM create_violation_for_allocation(
            v_allocation_one, v_violation_type, 'Historical allocations must be rejected.'
        );
    EXCEPTION
        WHEN raise_exception THEN
            v_rejected := TRUE;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'Violation creation for a historical allocation was accepted.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM audit_outbox
         WHERE aggregate_type = 'violations'
           AND aggregate_id IN (v_violation_one, v_violation_two)
           AND event_type = 'violation_created'
    ) THEN
        RAISE EXCEPTION 'Violation creation did not write audit outbox events.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM audit_outbox
         WHERE aggregate_type = 'violation_payments'
           AND event_type = 'payment_applied'
           AND payload ->> 'payment_id' = v_payment::TEXT
    ) THEN
        RAISE EXCEPTION 'Violation payment did not write audit outbox events.';
    END IF;
END;
$$;

ROLLBACK;
