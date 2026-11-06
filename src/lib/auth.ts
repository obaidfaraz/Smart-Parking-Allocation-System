import { jwtVerify, SignJWT } from "jose";
import { HttpError } from "@/lib/api";

export const SESSION_COOKIE = "parking_session";
export type StaffRole = "admin" | "parking_staff";

export interface AuthenticatedUser {
  userId: string;
  fullName: string;
  email: string;
  role: StaffRole;
}

function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || new TextEncoder().encode(secret).length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes.");
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  user: AuthenticatedUser,
): Promise<string> {
  return new SignJWT({
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(jwtSecret());
}

export async function getSessionUser(
  request: Request,
): Promise<AuthenticatedUser | null> {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.fullName !== "string" ||
      typeof payload.email !== "string" ||
      (payload.role !== "admin" && payload.role !== "parking_staff")
    ) {
      return null;
    }

    return {
      userId: payload.sub,
      fullName: payload.fullName,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export async function requireUser(
  request: Request,
  roles?: StaffRole[],
): Promise<AuthenticatedUser> {
  const user = await getSessionUser(request);
  if (!user) {
    throw new HttpError("Sign in is required.", 401);
  }
  if (roles && !roles.includes(user.role)) {
    throw new HttpError("You do not have permission to perform this action.", 403);
  }
  return user;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8,
  };
}
