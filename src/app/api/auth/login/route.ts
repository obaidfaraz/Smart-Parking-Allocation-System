import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { withApiErrors, HttpError, readJson } from "@/lib/api";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  type AuthenticatedUser,
} from "@/lib/auth";
import { query } from "@/lib/db";
import { loginSchema } from "@/lib/validation";

export const POST = withApiErrors(async (request) => {
  const input = loginSchema.parse(await readJson(request));
  const { rows } = await query<{
    user_id: string;
    full_name: string;
    email: string;
    password_hash: string;
    role: AuthenticatedUser["role"];
  }>(
    `SELECT user_id, full_name, email, password_hash, role
       FROM staff_users
      WHERE email = $1 AND is_active = TRUE`,
    [input.email],
  );
  const staff = rows[0];

  if (!staff || !(await bcrypt.compare(input.password, staff.password_hash))) {
    throw new HttpError("Email or password is incorrect.", 401);
  }

  const user: AuthenticatedUser = {
    userId: staff.user_id,
    fullName: staff.full_name,
    email: staff.email,
    role: staff.role,
  };
  const token = await createSessionToken(user);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  return Response.json({ user });
});
