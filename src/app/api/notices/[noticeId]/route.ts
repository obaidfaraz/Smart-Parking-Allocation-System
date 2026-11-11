import { HttpError, readJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { noticeStatusSchema, uuidSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ noticeId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  return withApiErrors(async () => {
    const user = await requireUser(request);
    const { noticeId: rawId } = await context.params;
    const noticeId = uuidSchema.parse(rawId);
    const { status } = noticeStatusSchema.parse(await readJson(request));

    const notice = await withTransaction(async (client) => {
      const { rows: currentRows } = await client.query<{
        notice_id: string;
        status: string;
        violation_id: string | null;
        violation_status: string | null;
      }>(
        `SELECT n.notice_id, n.status, n.violation_id, v.status AS violation_status
           FROM notices n
           LEFT JOIN violations v ON v.violation_id = n.violation_id
          WHERE n.notice_id = $1
          FOR UPDATE OF n`,
        [noticeId],
      );
      const current = currentRows[0];
      if (!current) {
        throw new HttpError("Notice was not found.", 404);
      }

      const allowed =
        (current.status === "sent" &&
          ["viewed", "paid", "expired", "cancelled"].includes(status)) ||
        (current.status === "viewed" &&
          ["paid", "expired", "cancelled"].includes(status));
      if (!allowed) {
        throw new HttpError("That notice status transition is not allowed.", 409);
      }
      if (status === "paid" && current.violation_status !== "paid") {
        throw new HttpError(
          "A notice can be marked paid only after its violation is fully settled.",
          409,
        );
      }

      const { rows } = await client.query(
        `UPDATE notices
            SET status = $2
          WHERE notice_id = $1
          RETURNING notice_id, violation_id, driver_id, notice_type,
                    subject, message, status, issued_at, due_date, sent_at`,
        [noticeId, status],
      );
      await client.query(
        `INSERT INTO audit_outbox (
           aggregate_type, aggregate_id, event_type, payload
         ) VALUES ('notices', $1, 'notice_status_changed', $2::JSONB)`,
        [
          noticeId,
          JSON.stringify({
            notice_id: noticeId,
            violation_id: current.violation_id,
            status,
            actor_type: "staff",
            actor_id: user.userId,
            summary: `Notice status changed to ${status}`,
          }),
        ],
      );
      return rows[0];
    });

    return Response.json({ notice });
  })(request);
}
