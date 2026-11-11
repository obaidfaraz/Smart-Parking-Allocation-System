BEGIN;

-- Keep the normalized phone list while retaining drivers.phone for the existing ER schema.
CREATE TABLE IF NOT EXISTS driver_phones (
    phone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES drivers(driver_id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (driver_id, phone_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_phones_primary
ON driver_phones(driver_id)
WHERE is_primary = TRUE;

INSERT INTO driver_phones (driver_id, phone_number, is_primary)
SELECT driver_id, phone, TRUE
FROM drivers
ON CONFLICT (phone_number) DO NOTHING;

CREATE OR REPLACE FUNCTION calculate_parking_fee(
    p_check_in TIMESTAMPTZ,
    p_check_out TIMESTAMPTZ,
    p_hourly_rate NUMERIC
)
RETURNS NUMERIC(10, 2) AS $$
DECLARE
    v_billable_hours NUMERIC;
BEGIN
    IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'Check-out time must be later than check-in time.';
    END IF;
    IF p_hourly_rate IS NULL OR p_hourly_rate < 0 THEN
        RAISE EXCEPTION 'Hourly rate must be zero or greater.';
    END IF;

    v_billable_hours := GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (p_check_out - p_check_in)) / 3600)
    );
    RETURN (v_billable_hours * p_hourly_rate)::NUMERIC(10, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION validate_active_allocation_slot()
RETURNS TRIGGER AS $$
DECLARE
    v_slot_status VARCHAR(20);
BEGIN
    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;

    SELECT current_status
      INTO v_slot_status
      FROM parking_slots
     WHERE slot_id = NEW.slot_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parking slot % does not exist.', NEW.slot_id;
    END IF;

    IF v_slot_status <> 'available'
       AND NOT EXISTS (
           SELECT 1
             FROM allocations
            WHERE slot_id = NEW.slot_id
              AND status = 'active'
              AND allocation_id = NEW.allocation_id
       ) THEN
        RAISE EXCEPTION 'Parking slot % is not available.', NEW.slot_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM driver_vehicles
         WHERE driver_id = NEW.driver_id
           AND vehicle_id = NEW.vehicle_id
           AND status = 'active'
           AND assigned_to IS NULL
    ) THEN
        RAISE EXCEPTION 'The selected driver does not have an active association with this vehicle.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_active_allocation_slot ON allocations;
CREATE TRIGGER trg_validate_active_allocation_slot
BEFORE INSERT OR UPDATE OF slot_id, driver_id, vehicle_id, status
ON allocations
FOR EACH ROW EXECUTE FUNCTION validate_active_allocation_slot();

CREATE OR REPLACE FUNCTION synchronize_slot_with_allocation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE parking_slots
           SET current_status = 'occupied',
               updated_at = NOW()
         WHERE slot_id = NEW.slot_id;
    ELSIF (TG_OP = 'INSERT' OR OLD.status = 'active')
          AND NOT EXISTS (
              SELECT 1
                FROM allocations
               WHERE slot_id = NEW.slot_id
                 AND status = 'active'
                 AND allocation_id <> NEW.allocation_id
          ) THEN
        UPDATE parking_slots
           SET current_status = 'available',
               updated_at = NOW()
         WHERE slot_id = NEW.slot_id
           AND current_status = 'occupied';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.slot_id <> NEW.slot_id THEN
        UPDATE parking_slots
           SET current_status = 'available',
               updated_at = NOW()
         WHERE slot_id = OLD.slot_id
           AND current_status = 'occupied'
           AND NOT EXISTS (
               SELECT 1
                 FROM allocations
                WHERE slot_id = OLD.slot_id
                  AND status = 'active'
                  AND allocation_id <> NEW.allocation_id
           );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_synchronize_slot_with_allocation ON allocations;
CREATE TRIGGER trg_synchronize_slot_with_allocation
AFTER INSERT OR UPDATE OF slot_id, status
ON allocations
FOR EACH ROW EXECUTE FUNCTION synchronize_slot_with_allocation();

CREATE OR REPLACE VIEW parking_area_occupancy AS
SELECT
    pa.area_id,
    pa.code,
    pa.name,
    pa.city,
    pa.status AS area_status,
    pa.hourly_rate,
    pa.total_slots AS configured_capacity,
    COUNT(ps.slot_id)::INTEGER AS registered_slots,
    COUNT(ps.slot_id) FILTER (WHERE ps.current_status = 'occupied')::INTEGER AS occupied_slots,
    COUNT(ps.slot_id) FILTER (WHERE ps.current_status = 'available')::INTEGER AS available_slots,
    COUNT(ps.slot_id) FILTER (WHERE ps.current_status = 'reserved')::INTEGER AS reserved_slots,
    COUNT(ps.slot_id) FILTER (WHERE ps.current_status = 'maintenance')::INTEGER AS maintenance_slots,
    COUNT(ps.slot_id) FILTER (WHERE ps.current_status = 'blocked')::INTEGER AS blocked_slots
FROM parking_areas pa
LEFT JOIN parking_slots ps ON ps.area_id = pa.area_id
GROUP BY pa.area_id;

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS allocation_id UUID
        REFERENCES allocations(allocation_id) ON DELETE RESTRICT;
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS payment_category VARCHAR(20) NOT NULL DEFAULT 'violation_fine';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'payments_category_allocation_check'
           AND conrelid = 'payments'::regclass
    ) THEN
        ALTER TABLE payments
            ADD CONSTRAINT payments_category_allocation_check
            CHECK (
                (payment_category = 'parking_fee' AND allocation_id IS NOT NULL)
                OR (payment_category = 'violation_fine' AND allocation_id IS NULL)
            );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_violation_payment_amounts()
RETURNS TRIGGER AS $$
DECLARE
    v_violation violations%ROWTYPE;
    v_payment payments%ROWTYPE;
    v_total_applied_for_violation NUMERIC(10,2);
    v_total_applied_for_payment NUMERIC(10,2);
BEGIN
    SELECT * INTO v_violation
      FROM violations
     WHERE violation_id = NEW.violation_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Violation % does not exist.', NEW.violation_id;
    END IF;

    SELECT * INTO v_payment
      FROM payments
     WHERE payment_id = NEW.payment_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % does not exist.', NEW.payment_id;
    END IF;

    IF v_payment.payment_category <> 'violation_fine' THEN
        RAISE EXCEPTION 'Parking-fee payments cannot be applied to violations.';
    END IF;
    IF v_payment.payment_status IN ('failed', 'refunded', 'cancelled') THEN
        RAISE EXCEPTION 'Only pending or successful payments can be applied to a violation.';
    END IF;

    SELECT COALESCE(SUM(amount_applied), 0)
      INTO v_total_applied_for_violation
      FROM violation_payments
     WHERE violation_id = NEW.violation_id
       AND violation_payment_id <> COALESCE(NEW.violation_payment_id, '00000000-0000-0000-0000-000000000000'::UUID);
    IF NEW.amount_applied > v_violation.fine_amount - v_total_applied_for_violation THEN
        RAISE EXCEPTION 'The total applied amount cannot exceed the outstanding fine for the violation.';
    END IF;

    SELECT COALESCE(SUM(amount_applied), 0)
      INTO v_total_applied_for_payment
      FROM violation_payments
     WHERE payment_id = NEW.payment_id
       AND violation_payment_id <> COALESCE(NEW.violation_payment_id, '00000000-0000-0000-0000-000000000000'::UUID);
    IF v_total_applied_for_payment + NEW.amount_applied > v_payment.amount THEN
        RAISE EXCEPTION 'The total applied amount cannot exceed the payment amount.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_violation_payment_amounts ON violation_payments;
CREATE TRIGGER trg_validate_violation_payment_amounts
BEFORE INSERT OR UPDATE OF amount_applied, violation_id, payment_id
ON violation_payments
FOR EACH ROW EXECUTE FUNCTION validate_violation_payment_amounts();

CREATE OR REPLACE FUNCTION validate_parking_payment_amount()
RETURNS TRIGGER AS $$
DECLARE
    v_allocation allocations%ROWTYPE;
    v_paid NUMERIC(10,2);
BEGIN
    IF NEW.payment_category <> 'parking_fee' OR NEW.payment_status <> 'success' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_allocation
      FROM allocations
     WHERE allocation_id = NEW.allocation_id
     FOR UPDATE;

    IF NOT FOUND OR v_allocation.status <> 'checked_out' THEN
        RAISE EXCEPTION 'Parking fees can only be paid for a checked-out allocation.';
    END IF;

    IF NEW.amount <= 0 THEN
        RAISE EXCEPTION 'Parking-fee payment amount must be greater than zero.';
    END IF;

    SELECT COALESCE(SUM(amount), 0)
      INTO v_paid
      FROM payments
     WHERE allocation_id = NEW.allocation_id
       AND payment_category = 'parking_fee'
       AND payment_status = 'success'
       AND payment_id <> COALESCE(NEW.payment_id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_paid + NEW.amount > v_allocation.total_fee THEN
        RAISE EXCEPTION 'Parking-fee payments cannot exceed the allocation total.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_parking_payment_amount ON payments;
CREATE TRIGGER trg_validate_parking_payment_amount
BEFORE INSERT OR UPDATE OF allocation_id, payment_category, amount, payment_status
ON payments
FOR EACH ROW EXECUTE FUNCTION validate_parking_payment_amount();

CREATE OR REPLACE FUNCTION sync_notices_after_violation_payment()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
        WITH changed_notices AS (
            UPDATE notices
               SET status = 'paid',
                   updated_at = NOW()
             WHERE violation_id = NEW.violation_id
               AND status IN ('sent', 'viewed')
            RETURNING notice_id, driver_id
        )
        INSERT INTO audit_outbox (
            aggregate_type, aggregate_id, event_type, payload
        )
        SELECT 'notices', notice_id, 'notice_paid',
               jsonb_build_object(
                   'notice_id', notice_id,
                   'violation_id', NEW.violation_id,
                   'driver_id', driver_id,
                   'actor_type', 'system',
                   'actor_id', 'payment-settlement',
                   'summary', 'Fine notice marked paid after violation settlement'
               )
          FROM changed_notices;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_paid_violation_notices ON violations;
CREATE TRIGGER trg_sync_paid_violation_notices
AFTER UPDATE OF status ON violations
FOR EACH ROW EXECUTE FUNCTION sync_notices_after_violation_payment();

CREATE OR REPLACE FUNCTION create_violation_for_allocation(
    p_allocation_id UUID,
    p_violation_type_id INTEGER,
    p_description TEXT
)
RETURNS UUID AS $$
DECLARE
    v_allocation allocations%ROWTYPE;
    v_violation_type violation_types%ROWTYPE;
    v_violation_id UUID;
    v_violation_number VARCHAR(30);
BEGIN
    SELECT * INTO v_allocation
      FROM allocations
     WHERE allocation_id = p_allocation_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Allocation % not found.', p_allocation_id;
    END IF;
    IF v_allocation.status <> 'active' THEN
        RAISE EXCEPTION 'A violation can only be created for an ACTIVE allocation.';
    END IF;
    IF p_description IS NULL OR btrim(p_description) = '' THEN
        RAISE EXCEPTION 'Violation description must not be empty.';
    END IF;

    SELECT * INTO v_violation_type
      FROM violation_types
     WHERE violation_type_id = p_violation_type_id;
    IF NOT FOUND OR NOT v_violation_type.is_active THEN
        RAISE EXCEPTION 'Violation type % does not exist or is inactive.', p_violation_type_id;
    END IF;

    v_violation_number := 'V-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 100000)::INT;
    INSERT INTO violations (
        allocation_id, slot_id, vehicle_id, driver_id, violation_type_id,
        violation_number, description, issue_time, fine_amount, status
    ) VALUES (
        v_allocation.allocation_id, v_allocation.slot_id, v_allocation.vehicle_id,
        v_allocation.driver_id, v_violation_type.violation_type_id,
        v_violation_number, p_description, NOW(), v_violation_type.default_fine, 'open'
    )
    RETURNING violation_id INTO v_violation_id;

    INSERT INTO audit_outbox (
        aggregate_type, aggregate_id, event_type, payload, status
    ) VALUES (
        'violations', v_violation_id, 'violation_created',
        jsonb_build_object(
            'violation_id', v_violation_id,
            'allocation_id', v_allocation.allocation_id,
            'vehicle_id', v_allocation.vehicle_id,
            'driver_id', v_allocation.driver_id,
            'fine_amount', v_violation_type.default_fine
        ),
        'pending'
    );
    RETURN v_violation_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_notice_for_violation(
    p_violation_id UUID,
    p_notice_type VARCHAR(30),
    p_subject VARCHAR(200),
    p_message TEXT,
    p_issued_by UUID,
    p_event_ref VARCHAR(80)
)
RETURNS UUID AS $$
DECLARE
    v_violation violations%ROWTYPE;
    v_notice_id UUID;
BEGIN
    SELECT * INTO v_violation
      FROM violations
     WHERE violation_id = p_violation_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Violation % not found.', p_violation_id;
    END IF;
    IF p_notice_type NOT IN ('fine_notice', 'payment_reminder', 'overdue_notice', 'dispute_notice')
       OR p_event_ref IS NULL
       OR btrim(p_event_ref) = ''
       OR p_subject IS NULL
       OR btrim(p_subject) = ''
       OR p_message IS NULL
       OR btrim(p_message) = '' THEN
        RAISE EXCEPTION 'Notice type, event reference, subject, and message must be valid.';
    END IF;

    INSERT INTO notices (
        violation_id, driver_id, issued_by, notice_type, event_ref,
        subject, message, status, issued_at, due_date, sent_at
    ) VALUES (
        v_violation.violation_id, v_violation.driver_id, p_issued_by,
        p_notice_type, p_event_ref, p_subject, p_message, 'sent',
        NOW(), NOW() + INTERVAL '7 days', NOW()
    )
    ON CONFLICT (violation_id, notice_type, event_ref) DO NOTHING
    RETURNING notice_id INTO v_notice_id;

    IF v_notice_id IS NULL THEN
        SELECT notice_id INTO v_notice_id
          FROM notices
         WHERE violation_id = p_violation_id
           AND notice_type = p_notice_type
           AND event_ref = p_event_ref;
        RETURN v_notice_id;
    END IF;

    INSERT INTO audit_outbox (
        aggregate_type, aggregate_id, event_type, payload, status
    ) VALUES (
        'notices', v_notice_id, 'notice_generated',
        jsonb_build_object(
            'notice_id', v_notice_id,
            'violation_id', p_violation_id,
            'driver_id', v_violation.driver_id,
            'notice_type', p_notice_type,
            'event_ref', p_event_ref
        ),
        'pending'
    );
    RETURN v_notice_id;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_vehicles_license_plate ON vehicles(license_plate);
CREATE INDEX IF NOT EXISTS idx_allocations_active_area_time
ON allocations(status, check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_payments_allocation_category
ON payments(allocation_id, payment_category, payment_status);

COMMIT;
