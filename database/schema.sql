BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Shared application users and roles
-- ============================================================
CREATE TABLE staff_users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'parking_staff')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- ============================================================
-- Member A: parking and allocation module
-- ============================================================
CREATE TABLE parking_areas (
    area_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(30) NOT NULL UNIQUE,
    description TEXT,
    address TEXT NOT NULL,
    city VARCHAR(80) NOT NULL,
    state VARCHAR(80),
    latitude NUMERIC(9, 6),
    longitude NUMERIC(9, 6),
    hourly_rate NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
    total_slots INTEGER NOT NULL CHECK (total_slots > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE parking_slots (
    slot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID NOT NULL REFERENCES parking_areas(area_id) ON DELETE RESTRICT,
    slot_number VARCHAR(20) NOT NULL,
    slot_type VARCHAR(20) NOT NULL CHECK (slot_type IN ('standard', 'compact', 'disabled', 'vip', 'two_wheeler')),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    current_status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (current_status IN ('available', 'occupied', 'reserved', 'maintenance', 'blocked')),
    floor_number INTEGER,
    row_label VARCHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (area_id, slot_number)
);

CREATE TABLE drivers (
    driver_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL UNIQUE,
    license_number VARCHAR(40) NOT NULL UNIQUE,
    address TEXT,
    city VARCHAR(80),
    state VARCHAR(80),
    driver_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (driver_status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vehicles (
    vehicle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_plate VARCHAR(20) NOT NULL UNIQUE,
    make VARCHAR(50),
    model VARCHAR(60),
    year INTEGER CHECK (year BETWEEN 1900 AND 2100),
    color VARCHAR(30),
    vehicle_type VARCHAR(20) NOT NULL CHECK (vehicle_type IN ('car', 'bike', 'truck', 'bus', 'van')),
    registration_number VARCHAR(40) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'retired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE driver_vehicles (
    driver_vehicle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES drivers(driver_id) ON DELETE RESTRICT,
    vehicle_id UUID NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE RESTRICT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_to TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (driver_id, vehicle_id, assigned_from)
);

CREATE TABLE allocations (
    allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id UUID NOT NULL REFERENCES parking_slots(slot_id) ON DELETE RESTRICT,
    vehicle_id UUID NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE RESTRICT,
    driver_id UUID NOT NULL REFERENCES drivers(driver_id) ON DELETE RESTRICT,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_check_out_time TIMESTAMPTZ,
    actual_check_out_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'checked_out', 'cancelled', 'expired')),
    total_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_fee >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (actual_check_out_time IS NULL OR actual_check_out_time >= check_in_time)
);

CREATE TABLE check_in_out_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_id UUID NOT NULL REFERENCES allocations(allocation_id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES parking_slots(slot_id) ON DELETE RESTRICT,
    vehicle_id UUID NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE RESTRICT,
    driver_id UUID NOT NULL REFERENCES drivers(driver_id) ON DELETE RESTRICT,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('check_in', 'check_out', 'manual_override', 'entry_denied')),
    event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_by VARCHAR(50) NOT NULL DEFAULT 'system'
);

CREATE TABLE occupancy_snapshot (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID NOT NULL REFERENCES parking_areas(area_id) ON DELETE RESTRICT,
    slot_id UUID NOT NULL REFERENCES parking_slots(slot_id) ON DELETE RESTRICT,
    allocation_id UUID REFERENCES allocations(allocation_id) ON DELETE SET NULL,
    occupied BOOLEAN NOT NULL DEFAULT FALSE,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_available_slots INTEGER NOT NULL DEFAULT 0 CHECK (current_available_slots >= 0),
    current_occupied_slots INTEGER NOT NULL DEFAULT 0 CHECK (current_occupied_slots >= 0),
    remarks TEXT
);

-- ============================================================
-- Member B: violation and payment module
-- ============================================================
CREATE TABLE violation_types (
    violation_type_id SERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE,
    description TEXT,
    default_fine NUMERIC(10, 2) NOT NULL CHECK (default_fine >= 0),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE violations (
    violation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_id UUID NOT NULL REFERENCES allocations(allocation_id) ON DELETE RESTRICT,
    slot_id UUID NOT NULL REFERENCES parking_slots(slot_id) ON DELETE RESTRICT,
    vehicle_id UUID NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE RESTRICT,
    driver_id UUID NOT NULL REFERENCES drivers(driver_id) ON DELETE RESTRICT,
    violation_type_id INTEGER NOT NULL REFERENCES violation_types(violation_type_id) ON DELETE RESTRICT,
    violation_number VARCHAR(30) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    issue_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fine_amount NUMERIC(10, 2) NOT NULL CHECK (fine_amount >= 0),
    status VARCHAR(25) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending_payment', 'paid', 'waived', 'disputed', 'closed')),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (issue_time >= created_at)
);

CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES drivers(driver_id) ON DELETE RESTRICT,
    vehicle_id UUID REFERENCES vehicles(vehicle_id) ON DELETE SET NULL,
    payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('cash', 'card', 'upi', 'bank_transfer', 'wallet')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'success', 'failed', 'refunded', 'cancelled')),
    transaction_reference VARCHAR(80) UNIQUE,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE violation_payments (
    violation_payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    violation_id UUID NOT NULL REFERENCES violations(violation_id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES payments(payment_id) ON DELETE RESTRICT,
    amount_applied NUMERIC(10, 2) NOT NULL CHECK (amount_applied > 0),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (violation_id, payment_id)
);

CREATE TABLE notices (
    notice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    violation_id UUID REFERENCES violations(violation_id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(driver_id) ON DELETE RESTRICT,
    issued_by UUID REFERENCES staff_users(user_id) ON DELETE RESTRICT,
    notice_type VARCHAR(30) NOT NULL CHECK (notice_type IN ('fine_notice', 'payment_reminder', 'overdue_notice', 'dispute_notice')),
    event_ref VARCHAR(80) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'expired', 'cancelled')),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (violation_id, notice_type, event_ref)
);

CREATE UNIQUE INDEX ux_active_allocation_slot
ON allocations (slot_id)
WHERE status = 'active';

CREATE UNIQUE INDEX ux_active_allocation_vehicle
ON allocations (vehicle_id)
WHERE status = 'active';

CREATE TABLE audit_outbox (
    outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(60) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    error_message TEXT
);

-- ============================================================
-- Generic updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_updated_at_parking_areas
BEFORE UPDATE ON parking_areas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at_parking_slots
BEFORE UPDATE ON parking_slots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at_drivers
BEFORE UPDATE ON drivers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at_vehicles
BEFORE UPDATE ON vehicles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at_allocations
BEFORE UPDATE ON allocations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at_staff_users
BEFORE UPDATE ON staff_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at_violations
BEFORE UPDATE ON violations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at_payments
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at_notices
BEFORE UPDATE ON notices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Rule: only one active allocation per slot and vehicle
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_multiple_active_allocations()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' THEN
        IF EXISTS (
            SELECT 1
            FROM allocations a
            WHERE a.slot_id = NEW.slot_id
              AND a.status = 'active'
              AND a.allocation_id <> COALESCE(NEW.allocation_id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) THEN
            RAISE EXCEPTION 'A slot cannot have more than one active allocation. slot_id=%', NEW.slot_id;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM allocations a
            WHERE a.vehicle_id = NEW.vehicle_id
              AND a.status = 'active'
              AND a.allocation_id <> COALESCE(NEW.allocation_id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) THEN
            RAISE EXCEPTION 'A vehicle cannot have more than one active allocation. vehicle_id=%', NEW.vehicle_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_multiple_active_allocations
BEFORE INSERT OR UPDATE OF slot_id, vehicle_id, status
ON allocations
FOR EACH ROW EXECUTE FUNCTION prevent_multiple_active_allocations();

-- ============================================================
-- Payment integrity and concurrency safety
-- ============================================================
CREATE OR REPLACE FUNCTION validate_violation_payment_amounts()
RETURNS TRIGGER AS $$
DECLARE
    v_violation violations%ROWTYPE;
    v_payment payments%ROWTYPE;
    v_total_applied_for_violation NUMERIC(10,2);
    v_total_applied_for_payment NUMERIC(10,2);
    v_outstanding_fine NUMERIC(10,2);
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

    SELECT COALESCE(SUM(amount_applied), 0)
      INTO v_total_applied_for_violation
      FROM violation_payments
     WHERE violation_id = NEW.violation_id
       AND violation_payment_id <> COALESCE(NEW.violation_payment_id, '00000000-0000-0000-0000-000000000000'::uuid);

    v_outstanding_fine := v_violation.fine_amount - v_total_applied_for_violation;

    IF NEW.amount_applied > v_outstanding_fine THEN
        RAISE EXCEPTION 'The total applied amount cannot exceed the outstanding fine for the violation.';
    END IF;

    SELECT COALESCE(SUM(amount_applied), 0)
      INTO v_total_applied_for_payment
      FROM violation_payments
     WHERE payment_id = NEW.payment_id
       AND violation_payment_id <> COALESCE(NEW.violation_payment_id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF (v_total_applied_for_payment + NEW.amount_applied) > v_payment.amount THEN
        RAISE EXCEPTION 'The total applied amount cannot exceed the payment amount.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_violation_payment_amounts
BEFORE INSERT OR UPDATE OF amount_applied, violation_id, payment_id
ON violation_payments
FOR EACH ROW EXECUTE FUNCTION validate_violation_payment_amounts();

-- ============================================================
-- Automatic violation generation
-- ============================================================
-- This function is invoked by application logic AFTER parking-rule evaluation.
-- Example automatic rules include: overstay detection, unauthorized parking,
-- vehicle parked in unauthorized area or slot misuse.
-- PostgreSQL itself does not automatically fire this function for all events.
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

    SELECT * INTO v_violation_type
    FROM violation_types
    WHERE violation_type_id = p_violation_type_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Violation type % not found.', p_violation_type_id;
    END IF;

    v_violation_number := 'V-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 100000)::int;

    INSERT INTO violations (
        allocation_id,
        slot_id,
        vehicle_id,
        driver_id,
        violation_type_id,
        violation_number,
        description,
        issue_time,
        fine_amount,
        status
    ) VALUES (
        v_allocation.allocation_id,
        v_allocation.slot_id,
        v_allocation.vehicle_id,
        v_allocation.driver_id,
        v_violation_type.violation_type_id,
        v_violation_number,
        p_description,
        NOW(),
        v_violation_type.default_fine,
        'open'
    )
    RETURNING violation_id INTO v_violation_id;

    INSERT INTO audit_outbox (
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        status
    ) VALUES (
        'violations',
        v_violation_id,
        'violation_created',
        jsonb_build_object(
            'violation_id', v_violation_id,
            'allocation_id', p_allocation_id,
            'vehicle_id', v_allocation.vehicle_id,
            'driver_id', v_allocation.driver_id,
            'fine_amount', v_violation_type.default_fine
        ),
        'pending'
    );

    RETURN v_violation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Payment application helper that enforces multi-violation settlement rules
-- ============================================================
CREATE OR REPLACE FUNCTION apply_payment_to_violation(
    p_violation_id UUID,
    p_payment_id UUID,
    p_amount_applied NUMERIC(10,2)
)
RETURNS UUID AS $$
DECLARE
    v_violation violations%ROWTYPE;
    v_payment payments%ROWTYPE;
    v_total_paid_for_violation NUMERIC(10,2);
    v_total_paid_for_payment NUMERIC(10,2);
    v_violation_payment_id UUID;
BEGIN
    IF p_amount_applied <= 0 THEN
        RAISE EXCEPTION 'Payment application amount must be greater than zero.';
    END IF;

    SELECT * INTO v_violation
    FROM violations
    WHERE violation_id = p_violation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Violation % not found.', p_violation_id;
    END IF;

    SELECT * INTO v_payment
    FROM payments
    WHERE payment_id = p_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % not found.', p_payment_id;
    END IF;

    IF v_payment.payment_status = 'failed' THEN
        RAISE EXCEPTION 'Cannot apply a failed payment to a violation.';
    END IF;

    SELECT COALESCE(SUM(amount_applied), 0)
      INTO v_total_paid_for_violation
      FROM violation_payments
     WHERE violation_id = p_violation_id;

    IF v_total_paid_for_violation + p_amount_applied > v_violation.fine_amount THEN
        RAISE EXCEPTION 'Payment amount exceeds the outstanding violation fine.';
    END IF;

    SELECT COALESCE(SUM(amount_applied), 0)
      INTO v_total_paid_for_payment
      FROM violation_payments
     WHERE payment_id = p_payment_id;

    IF v_total_paid_for_payment + p_amount_applied > v_payment.amount THEN
        RAISE EXCEPTION 'Payment amount exceeds the payment total.';
    END IF;

    INSERT INTO violation_payments (
        violation_id,
        payment_id,
        amount_applied
    ) VALUES (
        p_violation_id,
        p_payment_id,
        p_amount_applied
    )
    RETURNING violation_payment_id INTO v_violation_payment_id;

    IF (v_total_paid_for_violation + p_amount_applied) >= v_violation.fine_amount THEN
        UPDATE violations
           SET status = 'paid',
               resolved_at = NOW(),
               updated_at = NOW()
         WHERE violation_id = p_violation_id;
    ELSE
        UPDATE violations
           SET status = 'pending_payment',
               updated_at = NOW()
         WHERE violation_id = p_violation_id;
    END IF;

    IF (v_total_paid_for_payment + p_amount_applied) >= v_payment.amount THEN
        UPDATE payments
           SET payment_status = 'success',
               paid_at = COALESCE(paid_at, NOW()),
               updated_at = NOW()
         WHERE payment_id = p_payment_id;
    END IF;

    INSERT INTO audit_outbox (
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        status
    ) VALUES (
        'violation_payments',
        v_violation_payment_id,
        'payment_applied',
        jsonb_build_object(
            'violation_payment_id', v_violation_payment_id,
            'violation_id', p_violation_id,
            'payment_id', p_payment_id,
            'amount_applied', p_amount_applied
        ),
        'pending'
    );

    RETURN v_violation_payment_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Automatic notice generation
-- ============================================================
-- Notices are created by application logic after a rule is evaluated,
-- such as: violation issued, overdue fine, payment reminder, or dispute notice.
-- PostgreSQL does not auto-create notices for all business events without
-- explicit application invocation.
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

    IF EXISTS (
        SELECT 1
        FROM notices
        WHERE violation_id = p_violation_id
          AND notice_type = p_notice_type
          AND event_ref = p_event_ref
    ) THEN
        SELECT notice_id INTO v_notice_id
        FROM notices
        WHERE violation_id = p_violation_id
          AND notice_type = p_notice_type
          AND event_ref = p_event_ref
        LIMIT 1;

        RETURN v_notice_id;
    END IF;

    INSERT INTO notices (
        violation_id,
        driver_id,
        issued_by,
        notice_type,
        event_ref,
        subject,
        message,
        status,
        issued_at,
        due_date
    ) VALUES (
        v_violation.violation_id,
        v_violation.driver_id,
        p_issued_by,
        p_notice_type,
        p_event_ref,
        p_subject,
        p_message,
        'sent',
        NOW(),
        NOW() + INTERVAL '7 days'
    )
    RETURNING notice_id INTO v_notice_id;

    INSERT INTO audit_outbox (
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        status
    ) VALUES (
        'notices',
        v_notice_id,
        'notice_generated',
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

-- ============================================================
-- Indexes for common queries and joins
-- ============================================================
CREATE INDEX idx_parking_slots_area_status
ON parking_slots(area_id, current_status);

CREATE INDEX idx_parking_slots_available
ON parking_slots(is_available, current_status);

CREATE INDEX idx_allocations_slot_status
ON allocations(slot_id, status, check_in_time);

CREATE INDEX idx_allocations_vehicle_status
ON allocations(vehicle_id, status, check_in_time);

CREATE INDEX idx_allocations_driver_status
ON allocations(driver_id, status, check_in_time);

CREATE INDEX idx_check_in_out_events_allocation_time
ON check_in_out_events(allocation_id, event_time);

CREATE INDEX idx_occupancy_snapshot_area_time
ON occupancy_snapshot(area_id, observed_at);

CREATE INDEX idx_violations_allocation
ON violations(allocation_id);

CREATE INDEX idx_violations_vehicle_status
ON violations(vehicle_id, status, issue_time);

CREATE INDEX idx_violations_driver_status
ON violations(driver_id, status, issue_time);

CREATE INDEX idx_violations_type
ON violations(violation_type_id);

CREATE INDEX idx_payments_driver_status
ON payments(driver_id, payment_status, created_at);

CREATE INDEX idx_violation_payments_violation
ON violation_payments(violation_id);

CREATE INDEX idx_violation_payments_payment
ON violation_payments(payment_id);

CREATE INDEX idx_notices_driver_status
ON notices(driver_id, status, issued_at);

CREATE INDEX idx_notices_violation
ON notices(violation_id);

CREATE INDEX idx_notices_unique_event
ON notices(violation_id, notice_type, event_ref);

CREATE INDEX idx_outbox_pending
ON audit_outbox(status, created_at);

COMMIT;
