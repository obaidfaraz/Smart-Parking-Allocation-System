import { HttpError, readJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction, query } from "@/lib/db";
import { noticeSchema } from "@/lib/validation";

export const GET = withApiErrors(async (request) => {
  await requireUser(request);
  const { rows } = await query(`
    SELECT n.notice_id, n.violation_id, n.driver_id, n.issued_by,
           n.notice_type, n.event_ref, n.subject, n.message, n.status,
           n.issued_at, n.due_date, n.sent_at, n.created_at,
           d.first_name || ' ' || d.last_name AS driver_name,
           v.violation_number
      FROM notices n
      JOIN drivers d ON d.driver_id = n.driver_id
      LEFT JOIN violations v ON v.violation_id = n.violation_id
     ORDER BY n.issued_at DESC
     LIMIT 200
  `);
  return Response.json({ notices: rows });
});

export const POST = withApiErrors(async (request) => {
  const user = await requireUser(request);
  const input = noticeSchema.parse(await readJson(request));

  const notice = await withTransaction(async (client) => {
    const { rows: existing } = await client.query<{ notice_id: string }>(
      `SELECT notice_id
         FROM notices
        WHERE violation_id = $1
          AND notice_type = $2
          AND event_ref = $3
        FOR UPDATE`,
      [input.violationId, input.noticeType, input.eventRef],
    );

    const { rows } = await client.query<{ notice_id: string }>(
      `SELECT create_notice_for_violation($1, $2, $3, $4, $5, $6) AS notice_id`,
      [
        input.violationId,
        input.noticeType,
        input.subject,
        input.message,
        user.userId,
        input.eventRef,
      ],
    );
    const noticeId = rows[0]?.notice_id;
    if (!noticeId) {
      throw new HttpError("Could not create the notice.", 500);
    }

    await client.query(
      `UPDATE notices
          SET sent_at = COALESCE(sent_at, issued_at)
        WHERE notice_id = $1`,
      [noticeId],
    );
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
          summary: `${input.noticeType.replaceAll("_", " ")} issued`,
        }),
      ],
    );
    return { noticeId, created: existing.length === 0 };
  });

  const { rows } = await query(
    `SELECT notice_id, violation_id, driver_id, notice_type, event_ref,
            subject, message, status, issued_at, due_date, sent_at
       FROM notices
      WHERE notice_id = $1`,
    [notice.noticeId],
  );
  return Response.json(
    { notice: rows[0] },
    { status: notice.created ? 201 : 200 },
  );
});
