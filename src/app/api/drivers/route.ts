import { withApiErrors, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction, query } from "@/lib/db";
import { driverSchema } from "@/lib/validation";

export const GET = withApiErrors(async (request) => {
  await requireUser(request);
  const { rows } = await query(`
    SELECT d.driver_id, d.first_name, d.last_name, d.email, d.phone,
           d.license_number, d.address, d.city, d.state, d.driver_status,
           COALESCE(
             json_agg(json_build_object(
               'phoneNumber', dp.phone_number,
               'isPrimary', dp.is_primary
             ) ORDER BY dp.is_primary DESC, dp.phone_number)
             FILTER (WHERE dp.phone_id IS NOT NULL),
             '[]'::json
           ) AS phones
      FROM drivers d
      LEFT JOIN driver_phones dp ON dp.driver_id = d.driver_id
     GROUP BY d.driver_id
     ORDER BY d.last_name, d.first_name
  `);
  return Response.json({ drivers: rows });
});

export const POST = withApiErrors(async (request) => {
  await requireUser(request, ["admin"]);
  const input = driverSchema.parse(await readJson(request));
  const driver = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO drivers
         (first_name, last_name, email, phone, license_number, address, city, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING driver_id, first_name, last_name, email, phone, license_number, driver_status`,
      [
        input.firstName,
        input.lastName,
        input.email,
        input.phone,
        input.licenseNumber,
        input.address ?? null,
        input.city ?? null,
        input.state ?? null,
      ],
    );
    await client.query(
      `INSERT INTO driver_phones (driver_id, phone_number, is_primary)
       VALUES ($1, $2, TRUE)`,
      [rows[0].driver_id, input.phone],
    );
    return rows[0];
  });
  return Response.json({ driver }, { status: 201 });
});
