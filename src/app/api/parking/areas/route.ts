import { withApiErrors, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { areaSchema } from "@/lib/validation";

export const GET = withApiErrors(async (request) => {
  await requireUser(request);
  const { rows } = await query(`
    SELECT pa.area_id, pa.code, pa.name, pa.description, pa.address, pa.city, pa.state,
           pa.latitude, pa.longitude, pa.hourly_rate, pa.total_slots, pa.status,
           pa.created_at, pa.updated_at, COALESCE(o.registered_slots, 0) AS registered_slots,
           COALESCE(o.occupied_slots, 0) AS occupied_slots,
           COALESCE(o.available_slots, 0) AS available_slots
      FROM parking_areas pa
      LEFT JOIN parking_area_occupancy o ON o.area_id = pa.area_id
     ORDER BY pa.name
  `);
  return Response.json({ areas: rows });
});

export const POST = withApiErrors(async (request) => {
  await requireUser(request, ["admin"]);
  const input = areaSchema.parse(await readJson(request));
  const { rows } = await query(
    `INSERT INTO parking_areas
       (name, code, description, address, city, state, latitude, longitude,
        hourly_rate, total_slots, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING area_id, code, name, address, city, hourly_rate, total_slots, status`,
    [
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
  return Response.json({ area: rows[0] }, { status: 201 });
});
