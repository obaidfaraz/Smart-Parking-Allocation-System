import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { withApiErrors, HttpError, readJson } from "@/lib/api";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  type AuthenticatedUser,
} from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { setupSchema } from "@/lib/validation";

export const POST = withApiErrors(async (request) => {
  const input = setupSchema.parse(await readJson(request));
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [1481936224]);
    const { rows: existing } = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM staff_users) AS exists",
    );
    if (existing[0].exists) {
      throw new HttpError("Initial administrator setup is already complete.", 409);
    }

    const { rows } = await client.query<{
      user_id: string;
      full_name: string;
      email: string;
      role: AuthenticatedUser["role"];
    }>(
      `INSERT INTO staff_users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING user_id, full_name, email, role`,
      [input.fullName, input.email, passwordHash],
    );
    return {
      userId: rows[0].user_id,
      fullName: rows[0].full_name,
      email: rows[0].email,
      role: rows[0].role,
    };
  });

  const token = await createSessionToken(user);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  return Response.json({ user }, { status: 201 });
});
