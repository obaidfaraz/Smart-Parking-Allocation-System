import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { withApiErrors } from "@/lib/api";

export const GET = withApiErrors(async (request) => {
  await requireUser(request, ["admin"]);
  const [counts, events] = await Promise.all([
    query(`
      SELECT status, COUNT(*)::INTEGER AS count
        FROM audit_outbox
       GROUP BY status
    `),
    query(`
      SELECT outbox_id, aggregate_type, aggregate_id, event_type,
             status, created_at, published_at, retry_count, error_message
        FROM audit_outbox
       ORDER BY created_at DESC
       LIMIT 100
    `),
  ]);
  return Response.json({ counts: counts.rows, events: events.rows });
});
