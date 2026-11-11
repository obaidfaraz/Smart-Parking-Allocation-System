import { HttpError, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { publishAuditEvent } from "@/lib/mongodb";

const MAX_RETRIES = 10;
const BATCH_SIZE = 50;

interface OutboxEvent {
  outbox_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

export const POST = withApiErrors(async (request) => {
  await requireUser(request, ["admin"]);
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DATABASE) {
    throw new HttpError(
      "Configure MONGODB_URI and MONGODB_DATABASE before dispatching audit events.",
      503,
    );
  }

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query<OutboxEvent>(
      `SELECT outbox_id, aggregate_type, aggregate_id, event_type, payload, created_at
         FROM audit_outbox
        WHERE status IN ('pending', 'failed')
          AND retry_count < $1
        ORDER BY created_at, outbox_id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
        `,
      [MAX_RETRIES, BATCH_SIZE],
    );
    const failures: { outboxId: string; message: string }[] = [];
    let published = 0;

    for (const event of rows) {
      try {
        await publishAuditEvent({
          outboxId: event.outbox_id,
          aggregateType: event.aggregate_type,
          aggregateId: event.aggregate_id,
          eventType: event.event_type,
          payload: event.payload,
          createdAt: event.created_at,
        });
        await client.query(
          `UPDATE audit_outbox
              SET status = 'published',
                  published_at = NOW(),
                  error_message = NULL
            WHERE outbox_id = $1`,
          [event.outbox_id],
        );
        published += 1;
      } catch (error) {
        console.error(`MongoDB audit delivery failed for outbox ${event.outbox_id}:`, error);
        const message =
          error instanceof Error ? `MongoDB delivery failed (${error.name}).` : "MongoDB delivery failed.";
        await client.query(
          `UPDATE audit_outbox
              SET status = 'failed',
                  retry_count = retry_count + 1,
                  error_message = $2
            WHERE outbox_id = $1`,
          [event.outbox_id, message],
        );
        failures.push({ outboxId: event.outbox_id, message });
      }
    }

    return { selected: rows.length, published, failures };
  });

  return Response.json(
    {
      ...result,
      remainingRetries: MAX_RETRIES,
      message: result.failures.length
        ? "Some audit events failed delivery; they remain available for retry."
        : "Audit outbox batch processed.",
    },
    { status: result.failures.length ? 502 : 200 },
  );
});
