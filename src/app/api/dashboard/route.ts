import { withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const GET = withApiErrors(async (request) => {
  await requireUser(request);
  const { rows } = await query<{
    parking_areas: string;
    parking_slots: string;
    occupied_slots: string;
    available_slots: string;
    active_allocations: string;
    completed_allocations: string;
    parking_revenue: string;
    total_violations: string;
    outstanding_fines: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM parking_areas WHERE status = 'active') AS parking_areas,
      (SELECT COUNT(*) FROM parking_slots) AS parking_slots,
      (SELECT COUNT(*) FROM parking_slots WHERE current_status = 'occupied') AS occupied_slots,
      (SELECT COUNT(*) FROM parking_slots WHERE current_status = 'available') AS available_slots,
      (SELECT COUNT(*) FROM allocations WHERE status = 'active') AS active_allocations,
      (SELECT COUNT(*) FROM allocations WHERE status = 'checked_out') AS completed_allocations,
      (SELECT COALESCE(SUM(total_fee), 0) FROM allocations WHERE status = 'checked_out') AS parking_revenue,
      (SELECT COUNT(*) FROM violations) AS total_violations,
      (SELECT COALESCE(SUM(v.fine_amount - COALESCE(paid.total_paid, 0)), 0)
         FROM violations v
         LEFT JOIN LATERAL (
           SELECT SUM(vp.amount_applied) AS total_paid
           FROM violation_payments vp
           WHERE vp.violation_id = v.violation_id
         ) paid ON TRUE
        WHERE v.status NOT IN ('paid', 'waived', 'closed')) AS outstanding_fines
  `);
  const areaResult = await query(`
    SELECT area_id, code, name, city, hourly_rate, configured_capacity,
           registered_slots, occupied_slots, available_slots,
           reserved_slots, maintenance_slots, blocked_slots
      FROM parking_area_occupancy
     ORDER BY name
  `);

  return Response.json({ totals: rows[0], areas: areaResult.rows });
});
