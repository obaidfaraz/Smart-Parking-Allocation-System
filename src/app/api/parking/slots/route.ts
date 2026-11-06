import { withApiErrors, HttpError, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { slotSchema, uuidSchema } from "@/lib/validation";

export const GET = withApiErrors(async (request) => {
  await requireUser(request);
  const rawAreaId = new URL(request.url).searchParams.get("areaId");
  const areaId = rawAreaId ? uuidSchema.parse(rawAreaId) : null;
  const sql = `
    SELECT ps.slot_id, ps.area_id, ps.slot_number, ps.slot_type,
           ps.current_status, ps.floor_number, ps.row_label, pa.name AS area_name
      FROM parking_slots ps
      JOIN parking_areas pa ON pa.area_id = ps.area_id
      ${areaId ? "WHERE ps.area_id = $1" : ""}
     ORDER BY pa.name, ps.slot_number`;
  const { rows } = await query(sql, areaId ? [areaId] : []);
  return Response.json({ slots: rows });
});

export const POST = withApiErrors(async (request) => {
  await requireUser(request, ["admin"]);
  const input = slotSchema.parse(await readJson(request));
  const slot = await withTransaction(async (client) => {
    const { rows: areas } = await client.query<{
      total_slots: number;
      status: string;
    }>(
      "SELECT total_slots, status FROM parking_areas WHERE area_id = $1 FOR UPDATE",
      [input.areaId],
    );
    const area = areas[0];
    if (!area) {
      throw new HttpError("Parking area was not found.", 404);
    }
    if (area.status !== "active") {
      throw new HttpError("Slots can only be added to an active parking area.", 409);
    }

    const { rows: countRows } = await client.query<{ slot_count: string }>(
      "SELECT COUNT(*) AS slot_count FROM parking_slots WHERE area_id = $1",
      [input.areaId],
    );
    if (Number(countRows[0].slot_count) >= area.total_slots) {
      throw new HttpError("The configured capacity for this area is full.", 409);
    }

    const { rows } = await client.query(
      `INSERT INTO parking_slots (area_id, slot_number, slot_type, floor_number, row_label)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING slot_id, area_id, slot_number, slot_type, current_status, floor_number, row_label`,
      [
        input.areaId,
        input.slotNumber,
        input.slotType,
        input.floorNumber ?? null,
        input.rowLabel ?? null,
      ],
    );
    return rows[0];
  });
  return Response.json({ slot }, { status: 201 });
});
