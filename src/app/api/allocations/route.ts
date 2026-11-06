import { withApiErrors, HttpError, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction, query } from "@/lib/db";
import { allocationSchema } from "@/lib/validation";

export const GET = withApiErrors(async (request) => {
  await requireUser(request);
  const { rows } = await query(`
    SELECT a.allocation_id, a.slot_id, a.vehicle_id, a.driver_id,
           a.check_in_time, a.expected_check_out_time, a.actual_check_out_time,
           a.status, a.total_fee, ps.slot_number, pa.name AS area_name,
           v.license_plate, d.first_name || ' ' || d.last_name AS driver_name
      FROM allocations a
      JOIN parking_slots ps ON ps.slot_id = a.slot_id
      JOIN parking_areas pa ON pa.area_id = ps.area_id
      JOIN vehicles v ON v.vehicle_id = a.vehicle_id
      JOIN drivers d ON d.driver_id = a.driver_id
     ORDER BY (a.status = 'active') DESC, a.check_in_time DESC
     LIMIT 200
  `);
  return Response.json({ allocations: rows });
});

export const POST = withApiErrors(async (request) => {
  const user = await requireUser(request);
  const input = allocationSchema.parse(await readJson(request));
  const allocation = await withTransaction(async (client) => {
    const { rows: slots } = await client.query<{
      slot_id: string;
      current_status: string;
      area_status: string;
    }>(
      `SELECT ps.slot_id, ps.current_status, pa.status AS area_status
         FROM parking_slots ps
         JOIN parking_areas pa ON pa.area_id = ps.area_id
        WHERE ps.slot_id = $1
        FOR UPDATE OF ps`,
      [input.slotId],
    );
    const slot = slots[0];
    if (!slot) {
      throw new HttpError("Parking slot was not found.", 404);
    }
    if (slot.area_status !== "active" || slot.current_status !== "available") {
      throw new HttpError("The selected slot is not available for allocation.", 409);
    }

    const { rows: association } = await client.query(
      `SELECT 1
         FROM driver_vehicles dv
         JOIN drivers d ON d.driver_id = dv.driver_id
         JOIN vehicles v ON v.vehicle_id = dv.vehicle_id
        WHERE dv.driver_id = $1
          AND dv.vehicle_id = $2
          AND dv.status = 'active'
          AND dv.assigned_to IS NULL
          AND d.driver_status = 'active'
          AND v.status = 'active'`,
      [input.driverId, input.vehicleId],
    );
    if (!association[0]) {
      throw new HttpError("Select an active vehicle associated with this driver.", 409);
    }

    const { rows } = await client.query(
      `INSERT INTO allocations
         (slot_id, vehicle_id, driver_id, expected_check_out_time, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING allocation_id, slot_id, vehicle_id, driver_id,
                 check_in_time, expected_check_out_time, status, total_fee`,
      [
        input.slotId,
        input.vehicleId,
        input.driverId,
        input.expectedCheckOutTime ?? null,
      ],
    );
    await client.query(
      `INSERT INTO check_in_out_events
         (allocation_id, slot_id, vehicle_id, driver_id, event_type, created_by)
       VALUES ($1, $2, $3, $4, 'check_in', $5)`,
      [
        rows[0].allocation_id,
        input.slotId,
        input.vehicleId,
        input.driverId,
        user.email,
      ],
    );
    return rows[0];
  });
  return Response.json({ allocation }, { status: 201 });
});
