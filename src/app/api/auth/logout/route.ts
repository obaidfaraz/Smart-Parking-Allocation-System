import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function POST() {
  (await cookies()).set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  return Response.json({ ok: true });
}
