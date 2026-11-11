import type { Filter } from "mongodb";

import { HttpError, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getAuditCollection, type AuditLogDocument } from "@/lib/mongodb";
import { auditLogQuerySchema } from "@/lib/validation";

export const GET = withApiErrors(async (request) => {
  await requireUser(request, ["admin"]);
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DATABASE) {
    throw new HttpError(
      "Configure MONGODB_URI and MONGODB_DATABASE before reading audit logs.",
      503,
    );
  }

  const url = new URL(request.url);
  const input = auditLogQuerySchema.parse({
    eventType: url.searchParams.get("eventType") ?? undefined,
    entityType: url.searchParams.get("entityType") ?? undefined,
    actorType: url.searchParams.get("actorType") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    order: url.searchParams.get("order") ?? undefined,
  });

  const filter: Filter<AuditLogDocument> = {};
  if (input.eventType) {
    filter.event_type = input.eventType;
  }
  if (input.entityType) {
    filter.entity_type = input.entityType;
  }
  if (input.actorType) {
    filter.actor_type = input.actorType;
  }
  if (input.entityId) {
    filter.entity_id = input.entityId;
  }
  if (input.from || input.to) {
    const occurred: { $gte?: Date; $lte?: Date } = {};
    if (input.from) {
      occurred.$gte = new Date(input.from);
    }
    if (input.to) {
      occurred.$lte = new Date(input.to);
    }
    filter.occurred_at = occurred;
  }

  try {
    const collection = await getAuditCollection();
    const [logs, eventTypes, entityTypes] = await Promise.all([
      collection
        .find(filter, { projection: { payload: 0 } })
        .sort({
          occurred_at: input.order === "asc" ? 1 : -1,
          audit_id: input.order === "asc" ? 1 : -1,
        })
        .limit(input.limit)
        .toArray(),
      collection.distinct("event_type"),
      collection.distinct("entity_type"),
    ]);

    return Response.json({
      logs: logs.map((log) => ({
        audit_id: log.audit_id,
        event_type: log.event_type,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        actor_type: log.actor_type,
        actor_id: log.actor_id,
        occurred_at: log.occurred_at,
        summary: log.summary,
      })),
      eventTypes: eventTypes.sort(),
      entityTypes: entityTypes.sort(),
    });
  } catch (error) {
    console.error("MongoDB audit-log read failed:", error);
    throw new HttpError(
      "Audit logs are unavailable because MongoDB could not be reached.",
      503,
    );
  }
});
