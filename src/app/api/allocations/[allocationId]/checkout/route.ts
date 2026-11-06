import { withApiErrors, HttpError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { uuidSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ allocationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  return withApiErrors(async () => {
    const user = await requireUser(request);
    const { allocationId: rawId } = await context.params;
    const allocationId = uuidSchema.parse(rawId);
    const allocation = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        allocation_id: string;
        slot_id: string;
        vehicle_id: string;
        driver_id: string;
        status: string;
        fee: string;
      }>(
        `SELECT a.allocation_id, a.slot_id, a.vehicle_id, a.driver_id, a.status,
                calculate_parking_fee(a.check_in_time, NOW(), pa.hourly_rate) AS fee
           FROM allocations a
           JOIN parking_slots ps ON ps.slot_id = a.slot_id
           JOIN parking_areas pa ON pa.area_id = ps.area_id
          WHERE a.allocation_id = $1
          FOR UPDATE OF a`,
        [allocationId],
      );
      const current = rows[0];
      if (!current) {
        throw new HttpError("Allocation was not found.", 404);
      }
      if (current.status !== "active") {
        throw new HttpError("Only active allocations can be checked out.", 409);
      }

      const { rows: updatedRows } = await client.query(
        `UPDATE allocations
            SET status = 'checked_out',
                actual_check_out_time = NOW(),
                total_fee = $2
          WHERE allocation_id = $1
          RETURNING allocation_id, slot_id, vehicle_id, driver_id,
                    check_in_time, actual_check_out_time, status, total_fee`,
        [allocationId, current.fee],
      );
      await client.query(
        `INSERT INTO check_in_out_events
           (allocation_id, slot_id, vehicle_id, driver_id, event_type, created_by)
         VALUES ($1, $2, $3, $4, 'check_out', $5)`,
        [
          current.allocation_id,
          current.slot_id,
          current.vehicle_id,
          current.driver_id,
          user.email,
        ],
      );
      return updatedRows[0];
    });
    return Response.json({ allocation });
  })(request);
}
