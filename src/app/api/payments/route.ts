import { HttpError, readJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction, query } from "@/lib/db";
import { paymentSchema } from "@/lib/validation";

const cents = (amount: number) => Math.round(amount * 100);

export const GET = withApiErrors(async (request) => {
  await requireUser(request);
  const { rows } = await query(`
    SELECT p.payment_id, p.driver_id, p.vehicle_id, p.allocation_id,
           p.payment_category, p.payment_method, p.amount, p.payment_status,
           p.transaction_reference, p.paid_at, p.created_at,
           d.first_name || ' ' || d.last_name AS driver_name,
           v.license_plate,
           a.status AS allocation_status,
           COALESCE(applied.violations, '[]'::JSONB) AS violations
      FROM payments p
      JOIN drivers d ON d.driver_id = p.driver_id
      LEFT JOIN vehicles v ON v.vehicle_id = p.vehicle_id
      LEFT JOIN allocations a ON a.allocation_id = p.allocation_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
                 'violation_id', vp.violation_id,
                 'violation_number', vi.violation_number,
                 'amount_applied', vp.amount_applied
               ) ORDER BY vi.issue_time DESC) AS violations
          FROM violation_payments vp
          JOIN violations vi ON vi.violation_id = vp.violation_id
         WHERE vp.payment_id = p.payment_id
      ) applied ON TRUE
     ORDER BY p.created_at DESC
     LIMIT 200
  `);
  return Response.json({ payments: rows });
});

export const POST = withApiErrors(async (request) => {
  const user = await requireUser(request);
  const input = paymentSchema.parse(await readJson(request));

  if (input.paymentCategory === "parking_fee") {
    const payment = await withTransaction(async (client) => {
      const { rows: allocations } = await client.query<{
        allocation_id: string;
        driver_id: string;
        vehicle_id: string;
        status: string;
        total_fee: string;
      }>(
        `SELECT allocation_id, driver_id, vehicle_id, status, total_fee
           FROM allocations
          WHERE allocation_id = $1
          FOR UPDATE`,
        [input.allocationId],
      );
      const allocation = allocations[0];
      if (!allocation) {
        throw new HttpError("Allocation was not found.", 404);
      }
      if (allocation.status !== "checked_out") {
        throw new HttpError("Parking fees can only be paid after check-out.", 409);
      }

      const { rows: totals } = await client.query<{ paid: string }>(
        `SELECT COALESCE(SUM(amount), 0)::NUMERIC(10,2) AS paid
           FROM payments
          WHERE allocation_id = $1
            AND payment_category = 'parking_fee'
            AND payment_status = 'success'`,
        [input.allocationId],
      );
      const outstandingCents =
        cents(Number(allocation.total_fee)) - cents(Number(totals[0]?.paid ?? 0));
      if (cents(input.amount) > outstandingCents) {
        throw new HttpError("Payment exceeds the outstanding parking fee.", 409);
      }

      const { rows } = await client.query(
        `INSERT INTO payments (
           driver_id, vehicle_id, allocation_id, payment_category,
           payment_method, amount, payment_status, transaction_reference, paid_at
         )
         VALUES ($1, $2, $3, 'parking_fee', $4, $5, 'success', $6, NOW())
         RETURNING payment_id, driver_id, vehicle_id, allocation_id,
                   payment_category, payment_method, amount, payment_status,
                   transaction_reference, paid_at, created_at`,
        [
          allocation.driver_id,
          allocation.vehicle_id,
          allocation.allocation_id,
          input.paymentMethod,
          input.amount.toFixed(2),
          input.transactionReference ?? null,
        ],
      );
      const created = rows[0];
      await client.query(
        `INSERT INTO audit_outbox (
           aggregate_type, aggregate_id, event_type, payload
         ) VALUES ('payments', $1, 'parking_fee_paid', $2::JSONB)`,
        [
          created.payment_id,
          JSON.stringify({
            payment_id: created.payment_id,
            allocation_id: allocation.allocation_id,
            driver_id: allocation.driver_id,
            vehicle_id: allocation.vehicle_id,
            amount: input.amount.toFixed(2),
            actor_type: "staff",
            actor_id: user.userId,
            summary: `Parking fee payment recorded for allocation ${allocation.allocation_id}`,
          }),
        ],
      );

      const { rows: finalized } = await client.query(
        `SELECT payment_id, driver_id, vehicle_id, payment_category,
                payment_method, amount, payment_status, transaction_reference,
                paid_at, created_at
           FROM payments
          WHERE payment_id = $1`,
        [created.payment_id],
      );
      return finalized[0];
    });

    return Response.json({ payment }, { status: 201 });
  }

  const appliedTotalCents = input.applications.reduce(
    (total, application) => total + cents(application.amountApplied),
    0,
  );
  if (appliedTotalCents !== cents(input.amount)) {
    throw new HttpError(
      "The payment amount must equal the total applied across its violations.",
      400,
    );
  }

  const payment = await withTransaction(async (client) => {
    const violationIds = input.applications.map(
      (application) => application.violationId,
    );
    const { rows: violations } = await client.query<{
      violation_id: string;
      vehicle_id: string;
      status: string;
    }>(
      `SELECT violation_id, vehicle_id, status
         FROM violations
        WHERE driver_id = $1
          AND violation_id = ANY($2::UUID[])
          AND ($3::UUID IS NULL OR vehicle_id = $3)
          AND status IN ('open', 'pending_payment')
        ORDER BY violation_id
        FOR UPDATE`,
      [input.driverId, violationIds, input.vehicleId ?? null],
    );
    if (violations.length !== violationIds.length) {
      throw new HttpError(
        "Every selected violation must be unpaid and belong to the selected driver and vehicle.",
        409,
      );
    }

    const { rows } = await client.query(
      `INSERT INTO payments (
         driver_id, vehicle_id, payment_category, payment_method,
         amount, payment_status, transaction_reference
       )
       VALUES ($1, $2, 'violation_fine', $3, $4, 'pending', $5)
       RETURNING payment_id, driver_id, vehicle_id, payment_category,
                 payment_method, amount, payment_status, transaction_reference,
                 paid_at, created_at`,
      [
        input.driverId,
        input.vehicleId ?? null,
        input.paymentMethod,
        input.amount.toFixed(2),
        input.transactionReference ?? null,
      ],
    );
    const created = rows[0];

    for (const application of input.applications) {
      const { rows: applied } = await client.query<{ violation_payment_id: string }>(
        `SELECT apply_payment_to_violation($1, $2, $3) AS violation_payment_id`,
        [
          application.violationId,
          created.payment_id,
          application.amountApplied.toFixed(2),
        ],
      );
      const relationId = applied[0]?.violation_payment_id;
      if (!relationId) {
        throw new HttpError("Could not apply payment to the violation.", 500);
      }
      await client.query(
        `UPDATE audit_outbox
            SET payload = payload || $2::JSONB
          WHERE aggregate_type = 'violation_payments'
            AND aggregate_id = $1
            AND event_type = 'payment_applied'`,
        [
          relationId,
          JSON.stringify({
            actor_type: "staff",
            actor_id: user.userId,
            summary: `Payment applied to violation ${application.violationId}`,
          }),
        ],
      );
    }

    await client.query(
      `INSERT INTO audit_outbox (
         aggregate_type, aggregate_id, event_type, payload
       ) VALUES ('payments', $1, 'violation_payment_recorded', $2::JSONB)`,
      [
        created.payment_id,
        JSON.stringify({
          payment_id: created.payment_id,
          driver_id: input.driverId,
          vehicle_id: input.vehicleId ?? null,
          amount: input.amount.toFixed(2),
          violation_ids: violationIds,
          actor_type: "staff",
          actor_id: user.userId,
          summary: `Violation fine payment recorded for ${violationIds.length} violation(s)`,
        }),
      ],
    );

    const { rows: finalized } = await client.query(
      `SELECT payment_id, driver_id, vehicle_id, payment_category,
              payment_method, amount, payment_status, transaction_reference,
              paid_at, created_at
         FROM payments
        WHERE payment_id = $1`,
      [created.payment_id],
    );
    return finalized[0];
  });

  return Response.json({ payment }, { status: 201 });
});
