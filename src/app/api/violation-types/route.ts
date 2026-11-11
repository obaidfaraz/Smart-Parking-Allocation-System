import { HttpError, readJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { violationTypeSchema } from "@/lib/validation";

export const GET = withApiErrors(async (request) => {
  await requireUser(request);
  const { rows } = await query(`
    SELECT violation_type_id, name, description, default_fine, severity, is_active
      FROM violation_types
     ORDER BY is_active DESC, severity DESC, name
  `);
  return Response.json({ violationTypes: rows });
});

export const POST = withApiErrors(async (request) => {
  await requireUser(request, ["admin"]);
  const input = violationTypeSchema.parse(await readJson(request));
  const { rows } = await query(
    `INSERT INTO violation_types (name, description, default_fine, severity)
     VALUES ($1, $2, $3, $4)
     RETURNING violation_type_id, name, description, default_fine, severity, is_active`,
    [
      input.name,
      input.description ?? null,
      input.defaultFine.toFixed(2),
      input.severity,
    ],
  );
  if (!rows[0]) {
    throw new HttpError("Could not create the violation type.", 500);
  }
  return Response.json({ violationType: rows[0] }, { status: 201 });
});
