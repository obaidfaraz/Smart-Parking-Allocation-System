import { withApiErrors, HttpError, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { slotStatusSchema, uuidSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ slotId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  return withApiErrors(async () => {
    await requireUser(request, ["admin"]);
    const { slotId: rawId } = await context.params;
    const slotId = uuidSchema.parse(rawId);
    const input = slotStatusSchema.parse(await readJson(request));
    const slot = await withTransaction(async (client) => {
      const { rows: current } = await client.query<{ current_status: string }>(
        "SELECT current_status FROM parking_slots WHERE slot_id = $1 FOR UPDATE",
        [slotId],
      );
      if (!current[0]) {
        throw new HttpError("Parking slot was not found.", 404);
      }
      if (current[0].current_status === "occupied" || current[0].current_status === "reserved") {
        throw new HttpError("An occupied or reserved slot cannot be manually changed.", 409);
      }

      const { rows } = await client.query(
        `UPDATE parking_slots
            SET current_status = $2
          WHERE slot_id = $1
          RETURNING slot_id, current_status`,
        [slotId, input.currentStatus],
      );
      return rows[0];
    });
    return Response.json({ slot });
  })(request);
}
