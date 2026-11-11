import { withApiErrors, readJson, HttpError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction, query } from "@/lib/db";
import { vehicleSchema } from "@/lib/validation";

export const GET = withApiErrors(async (request) => {
  await requireUser(request);
  const { rows } = await query(`
    SELECT v.vehicle_id, v.license_plate, v.make, v.model, v.year, v.color,
           v.vehicle_type, v.registration_number, v.status,
           dv.driver_id, d.first_name || ' ' || d.last_name AS driver_name,
           dv.is_primary
      FROM vehicles v
      LEFT JOIN driver_vehicles dv
        ON dv.vehicle_id = v.vehicle_id
       AND dv.status = 'active'
       AND dv.assigned_to IS NULL
      LEFT JOIN drivers d ON d.driver_id = dv.driver_id
     ORDER BY v.license_plate, d.last_name
  `);
  return Response.json({ vehicles: rows });
});

export const POST = withApiErrors(async (request) => {
  await requireUser(request, ["admin"]);
  const input = vehicleSchema.parse(await readJson(request));
  const vehicle = await withTransaction(async (client) => {
    const { rows: driverRows } = await client.query(
      "SELECT driver_id FROM drivers WHERE driver_id = $1 AND driver_status = 'active' FOR UPDATE",
      [input.driverId],
    );
    if (!driverRows[0]) {
      throw new HttpError("An active driver must be selected.", 404);
    }

    const { rows } = await client.query(
      `INSERT INTO vehicles
         (license_plate, make, model, year, color, vehicle_type, registration_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING vehicle_id, license_plate, make, model, year, color, vehicle_type, status`,
      [
        input.licensePlate,
        input.make ?? null,
        input.model ?? null,
        input.year ?? null,
        input.color ?? null,
        input.vehicleType,
        input.registrationNumber ?? null,
      ],
    );
    if (input.isPrimary) {
      await client.query(
        `UPDATE driver_vehicles SET is_primary = FALSE
          WHERE driver_id = $1 AND status = 'active' AND assigned_to IS NULL`,
        [input.driverId],
      );
    }
    await client.query(
      `INSERT INTO driver_vehicles (driver_id, vehicle_id, is_primary)
       VALUES ($1, $2, $3)`,
      [input.driverId, rows[0].vehicle_id, input.isPrimary],
    );
    return rows[0];
  });
  return Response.json({ vehicle }, { status: 201 });
});
