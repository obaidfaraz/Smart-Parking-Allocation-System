import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError("Request body must be valid JSON.", 400);
  }
}

export function withApiErrors(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "digest" in error &&
        typeof error.digest === "string" &&
        error.digest.startsWith("NEXT_PRERENDER")
      ) {
        throw error;
      }

      if (error instanceof HttpError) {
        return Response.json({ error: error.message }, { status: error.status });
      }

      if (error instanceof ZodError) {
        return Response.json(
          { error: "Request validation failed.", issues: error.issues },
          { status: 400 },
        );
      }

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        return Response.json(
          { error: "A record with the supplied unique value already exists." },
          { status: 409 },
        );
      }

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23503"
      ) {
        return Response.json(
          { error: "The requested record is referenced by other data." },
          { status: 409 },
        );
      }

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P0001" &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        return Response.json({ error: error.message }, { status: 409 });
      }

      console.error("API request failed:", error);
      return Response.json(
        { error: "The request could not be completed." },
        { status: 500 },
      );
    }
  };
}
