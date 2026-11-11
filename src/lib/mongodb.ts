import { MongoClient, type Collection } from "mongodb";

export interface AuditLogDocument {
  audit_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  actor_type: string;
  actor_id: string;
  occurred_at: Date;
  payload: Record<string, unknown>;
  summary: string;
}

const globalForMongo = globalThis as typeof globalThis & {
  auditCollection?: Promise<Collection<AuditLogDocument>>;
};

export function getAuditCollection(): Promise<Collection<AuditLogDocument>> {
  const uri = process.env.MONGODB_URI;
  const database = process.env.MONGODB_DATABASE;
  if (!uri || !database) {
    throw new Error("MONGODB_URI and MONGODB_DATABASE must be configured.");
  }

  if (!globalForMongo.auditCollection) {
    globalForMongo.auditCollection = (async () => {
      const client = new MongoClient(uri);
      await client.connect();
      const collection = client
        .db(database)
        .collection<AuditLogDocument>("audit_logs");
      await collection.createIndex({ audit_id: 1 }, { unique: true });
      return collection;
    })().catch((error: unknown) => {
      globalForMongo.auditCollection = undefined;
      throw error;
    });
  }

  return globalForMongo.auditCollection;
}

export async function publishAuditEvent(event: {
  outboxId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date | string;
}): Promise<void> {
  const collection = await getAuditCollection();
  const payload = event.payload;
  const actorType =
    typeof payload.actor_type === "string" ? payload.actor_type : "system";
  const actorId =
    typeof payload.actor_id === "string" ? payload.actor_id : "database";
  const summary =
    typeof payload.summary === "string"
      ? payload.summary
      : `${event.eventType.replaceAll("_", " ")} for ${event.aggregateType}`;

  await collection.updateOne(
    { audit_id: event.outboxId },
    {
      $setOnInsert: {
        audit_id: event.outboxId,
        event_type: event.eventType,
        entity_type: event.aggregateType,
        entity_id: event.aggregateId,
        actor_type: actorType,
        actor_id: actorId,
        occurred_at: new Date(event.createdAt),
        payload,
        summary,
      },
    },
    { upsert: true },
  );
}
