import { HttpError, readJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction, query } from "@/lib/db";
import { uuidSchema, violationStatusSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ violationId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  return withApiErrors(async () => {
    const user = await requireUser(request);
    const { violationId: rawId } = await context.params;
    const violationId = uuidSchema.parse(rawId);
    const input = violationStatusSchema.parse(await readJson(request));

    await withTransaction(async (client) => {
      const { rows } = await client.query<{
        violation_id: string;
        violation_number: string;
        status: string;
      }>(
        `SELECT violation_id, violation_number, status
           FROM violations
          WHERE violation_id = $1
          FOR UPDATE`,
        [violationId],
      );
      const violation = rows[0];
      if (!violation) {
        throw new HttpError("Violation was not found.", 404);
      }

      const allowed =
        (input.status === "disputed" &&
          ["open", "pending_payment"].includes(violation.status)) ||
        (input.status === "waived" &&
          user.role === "admin" &&
          ["open", "pending_payment", "disputed"].includes(violation.status)) ||
        (input.status === "closed" &&
          user.role === "admin" &&
          ["paid", "waived"].includes(violation.status));
      if (!allowed) {
        throw new HttpError(
          "You are not allowed to make that violation status transition.",
          409,
        );
      }

      await client.query(
        `UPDATE violations
            SET status = $2,
                resolved_at = CASE
                  WHEN $2::varchar IN ('waived', 'closed') THEN NOW()
                  ELSE resolved_at
                END
          WHERE violation_id = $1`,
        [violationId, input.status],
      );
      await client.query(
        `INSERT INTO audit_outbox (
           aggregate_type, aggregate_id, event_type, payload
         ) VALUES ('violations', $1, 'violation_status_changed', $2::JSONB)`,
        [
          violationId,
          JSON.stringify({
            violation_id: violationId,
            previous_status: violation.status,
            status: input.status,
            reason: input.reason,
            actor_type: "staff",
            actor_id: user.userId,
            summary: `Violation ${violation.violation_number} marked ${input.status}`,
          }),
        ],
      );

      if (input.status === "disputed") {
        const { rows: notices } = await client.query<{ notice_id: string }>(
          `SELECT create_notice_for_violation(
             $1, 'dispute_notice', $2, $3, $4, $5
           ) AS notice_id`,
          [
            violationId,
            `Dispute received: ${violation.violation_number}`,
            input.reason,
            user.userId,
            `status:disputed:${violationId}`,
          ],
        );
        const noticeId = notices[0]?.notice_id;
        if (!noticeId) {
          throw new HttpError("Could not create the dispute notice.", 500);
        }
        await client.query(
          `UPDATE audit_outbox
              SET payload = payload || $2::JSONB
            WHERE aggregate_type = 'notices'
              AND aggregate_id = $1
              AND event_type = 'notice_generated'`,
          [
            noticeId,
            JSON.stringify({
              actor_type: "staff",
              actor_id: user.userId,
              summary: `Dispute notice issued for ${violation.violation_number}`,
            }),
          ],
        );
      }

      if (input.status === "waived") {
        const { rows: cancelledNotices } = await client.query<{
          notice_id: string;
          driver_id: string;
        }>(
          `UPDATE notices
              SET status = 'cancelled'
            WHERE violation_id = $1
              AND status IN ('sent', 'viewed')
            RETURNING notice_id, driver_id`,
          [violationId],
        );
        for (const notice of cancelledNotices) {
          await client.query(
            `INSERT INTO audit_outbox (
               aggregate_type, aggregate_id, event_type, payload
             ) VALUES ('notices', $1, 'notice_status_changed', $2::JSONB)`,
            [
              notice.notice_id,
              JSON.stringify({
                notice_id: notice.notice_id,
                violation_id: violationId,
                driver_id: notice.driver_id,
                status: "cancelled",
                actor_type: "staff",
                actor_id: user.userId,
                summary: "Notice cancelled because its violation was waived",
              }),
            ],
          );
        }
      }
    });

    const { rows } = await query(
      `SELECT violation_id, violation_number, status, resolved_at, updated_at
         FROM violations
        WHERE violation_id = $1`,
      [violationId],
    );
    return Response.json({ violation: rows[0] });
  })(request);
}
