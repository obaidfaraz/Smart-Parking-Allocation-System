import { HttpError, readJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction, query } from "@/lib/db";
import { violationSchema } from "@/lib/validation";

export const GET = withApiErrors(async (request) => {
  await requireUser(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const allowedStatuses = [
    "open",
    "pending_payment",
    "paid",
    "waived",
    "disputed",
    "closed",
  ];
  if (status && !allowedStatuses.includes(status)) {
    throw new HttpError("Unsupported violation status.", 400);
  }

  const { rows } = await query(
    `SELECT v.violation_id, v.violation_number, v.allocation_id,
            v.slot_id, v.vehicle_id, v.driver_id, v.violation_type_id,
            vt.name AS violation_type, vt.severity, v.description,
            v.issue_time, v.fine_amount, v.status, v.resolved_at,
            ps.slot_number, pa.name AS area_name, ve.license_plate,
            d.first_name || ' ' || d.last_name AS driver_name,
            paid.amount_paid,
            GREATEST(v.fine_amount - paid.amount_paid, 0)::NUMERIC(10,2)
              AS outstanding_amount
       FROM violations v
       JOIN violation_types vt ON vt.violation_type_id = v.violation_type_id
       JOIN parking_slots ps ON ps.slot_id = v.slot_id
       JOIN parking_areas pa ON pa.area_id = ps.area_id
       JOIN vehicles ve ON ve.vehicle_id = v.vehicle_id
       JOIN drivers d ON d.driver_id = v.driver_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(vp.amount_applied), 0)::NUMERIC(10,2) AS amount_paid
           FROM violation_payments vp
           JOIN payments p ON p.payment_id = vp.payment_id
          WHERE vp.violation_id = v.violation_id
            AND p.payment_status = 'success'
       ) paid ON TRUE
      WHERE ($1::VARCHAR IS NULL OR v.status = $1)
      ORDER BY v.issue_time DESC
      LIMIT 200`,
    [status],
  );
  return Response.json({ violations: rows });
});

export const POST = withApiErrors(async (request) => {
  const user = await requireUser(request);
  const input = violationSchema.parse(await readJson(request));

  const violation = await withTransaction(async (client) => {
    const { rows: types } = await client.query<{
      name: string;
      is_active: boolean;
    }>(
      `SELECT name, is_active
         FROM violation_types
        WHERE violation_type_id = $1
        FOR SHARE`,
      [input.violationTypeId],
    );
    if (!types[0] || !types[0].is_active) {
      throw new HttpError("The selected violation type is not active.", 409);
    }

    const { rows: created } = await client.query<{ violation_id: string }>(
      `SELECT create_violation_for_allocation($1, $2, $3) AS violation_id`,
      [input.allocationId, input.violationTypeId, input.description],
    );
    const violationId = created[0]?.violation_id;
    if (!violationId) {
      throw new HttpError("Could not create the violation.", 500);
    }

    const { rows: details } = await client.query<{
      violation_number: string;
      driver_id: string;
      fine_amount: string;
      vehicle_id: string;
    }>(
      `SELECT violation_number, driver_id, fine_amount, vehicle_id
         FROM violations
        WHERE violation_id = $1`,
      [violationId],
    );
    const detail = details[0];
    if (!detail) {
      throw new HttpError("Created violation could not be loaded.", 500);
    }

    const eventActor = JSON.stringify({
      actor_type: "staff",
      actor_id: user.userId,
      summary: `Violation ${detail.violation_number} issued`,
    });
    await client.query(
      `UPDATE audit_outbox
          SET payload = payload || $2::JSONB
        WHERE aggregate_type = 'violations'
          AND aggregate_id = $1
          AND event_type = 'violation_created'`,
      [violationId, eventActor],
    );

    const { rows: notices } = await client.query<{ notice_id: string }>(
      `SELECT create_notice_for_violation(
         $1, 'fine_notice', $2, $3, $4, $5
       ) AS notice_id`,
      [
        violationId,
        `Fine notice: ${detail.violation_number}`,
        `${input.description} Fine amount: INR ${detail.fine_amount}. Payment is due within 7 days.`,
        user.userId,
        `violation:${violationId}`,
      ],
    );
    if (!notices[0]?.notice_id) {
      throw new HttpError("Could not create the violation notice.", 500);
    }

    await client.query(
      `UPDATE audit_outbox
          SET payload = payload || $2::JSONB
        WHERE aggregate_type = 'notices'
          AND aggregate_id = $1
          AND event_type = 'notice_generated'`,
      [
        notices[0].notice_id,
        JSON.stringify({
          actor_type: "staff",
          actor_id: user.userId,
          summary: `Fine notice issued for ${detail.violation_number}`,
        }),
      ],
    );

    return {
      violationId,
      noticeId: notices[0].notice_id,
      vehicleId: detail.vehicle_id,
    };
  });

  const { rows } = await query(
    `SELECT v.violation_id, v.violation_number, v.allocation_id,
            v.vehicle_id, v.driver_id, vt.name AS violation_type,
            v.description, v.issue_time, v.fine_amount, v.status,
            v.slot_id, v.violation_type_id
       FROM violations v
       JOIN violation_types vt ON vt.violation_type_id = v.violation_type_id
      WHERE v.violation_id = $1`,
    [violation.violationId],
  );
  return Response.json(
    { violation: rows[0], noticeId: violation.noticeId },
    { status: 201 },
  );
});
