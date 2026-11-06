import { withApiErrors } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const GET = withApiErrors(async (request) => {
  const user = await getSessionUser(request);
  if (user) {
    return Response.json({ user, setupRequired: false });
  }

  const { rows } = await query<{ setup_required: boolean }>(
    "SELECT NOT EXISTS (SELECT 1 FROM staff_users) AS setup_required",
  );
  return Response.json({ user: null, setupRequired: rows[0].setup_required });
});
