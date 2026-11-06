import { withApiErrors, HttpError, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { areaSchema, uuidSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ areaId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  return withApiErrors(async () => {
    await requireUser(request, ["admin"]);
    const { areaId: rawId } = await context.params;
    const areaId = uuidSchema.parse(rawId);
    const input = areaSchema.parse(await readJson(request));
    const area = await withTransaction(async (client) => {
      const { rows: current } = await client.query<{ area_id: string }>(
        "SELECT area_id FROM parking_areas WHERE area_id = $1 FOR UPDATE",
        [areaId],
      );
      if (!current[0]) {
        throw new HttpError("Parking area was not found.", 404);
      }
      const { rows: countRows } = await client.query<{ slot_count: string }>(
        "SELECT COUNT(*) AS slot_count FROM parking_slots WHERE area_id = $1",
        [areaId],
      );
      if (Number(countRows[0].slot_count) > input.totalSlots) {
        throw new HttpError("Configured capacity cannot be lower than the registered slot count.", 409);
      }
      const { rows } = await client.query(
        `UPDATE parking_areas
            SET name = $2, code = $3, description = $4, address = $5, city = $6,
                state = $7, latitude = $8, longitude = $9, hourly_rate = $10,
                total_slots = $11, status = $12
          WHERE area_id = $1
          RETURNING area_id, code, name, address, city, hourly_rate, total_slots, status`,
        [
          areaId,
          input.name,
          input.code,
          input.description ?? null,
          input.address,
          input.city,
          input.state ?? null,
          input.latitude ?? null,
          input.longitude ?? null,
          input.hourlyRate,
          input.totalSlots,
          input.status,
        ],
      );
      return rows[0];
    });
    return Response.json({ area });
  })(request);
}
