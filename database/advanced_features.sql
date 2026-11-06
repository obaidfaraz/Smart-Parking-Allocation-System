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

CREATE INDEX IF NOT EXISTS idx_vehicles_license_plate ON vehicles(license_plate);
CREATE INDEX IF NOT EXISTS idx_allocations_active_area_time
ON allocations(status, check_in_time DESC);

COMMIT;
