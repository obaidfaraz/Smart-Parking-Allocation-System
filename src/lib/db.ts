import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const globalForPg = globalThis as typeof globalThis & {
  parkingPool?: Pool;
};

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!globalForPg.parkingPool) {
    globalForPg.parkingPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: true }
          : undefined,
    });
  }

  return globalForPg.parkingPool;
}

export function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<Row>> {
  return getPool().query<Row>(text, values);
}

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
