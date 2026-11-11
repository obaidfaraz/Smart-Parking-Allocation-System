# Application architecture

## Runtime components

- Next.js App Router renders the operations dashboard and serves API route handlers.
- PostgreSQL is the source of truth for staff, parking areas, slots, drivers, vehicles, allocations, payments and violations.
- `pg` connection pooling is managed in `src/lib/db.ts`; business operations that change multiple records use a single transaction.
- Zod validates request bodies before parameterized PostgreSQL statements execute.
- An eight-hour signed session cookie is HTTP-only, same-site and secure in production. API handlers check the staff role on the server.

## Member A request flow

1. A staff member submits a check-in request with driver, vehicle and available slot identifiers.
2. The API validates the request and opens a transaction.
3. It locks the selected slot, verifies that the area, driver, vehicle and association are active, then inserts the allocation and check-in event.
4. The database trigger marks the slot occupied. Partial unique indexes prevent concurrent duplicate active allocations.
5. On check-out, the API locks the allocation, calls `calculate_parking_fee`, records the check-out event and changes the allocation to `checked_out`.
6. The database trigger releases the slot. The dashboard reads current occupancy from PostgreSQL.

## Setup lifecycle

The `/setup` page can create the first administrator only while `staff_users` is empty. A PostgreSQL advisory transaction lock makes the first-admin check safe against parallel requests. Later users sign in at `/login`.

## Member B request and audit flow

1. Authenticated staff create a violation by selecting an active allocation and active violation type. The PostgreSQL helper snapshots the allocation's driver, vehicle and slot, then inserts an outbox event.
2. The API creates the fine notice in the same PostgreSQL transaction; a notice event key prevents duplicate notices.
3. Staff record violation-fine payments. One payment may be split across multiple outstanding violations for the same driver, including that driver's different vehicles. Parking-fee payments instead reference a checked-out allocation and cannot exceed its recorded fee.
4. Payment settlement updates the violation state and marks sent/viewed notices paid when the violation is fully settled.
5. Admins dispatch outbox events to MongoDB with `POST /api/audit/dispatch`. The worker locks a bounded batch, upserts audit documents using unique outbox IDs, and marks delivery success/failure in PostgreSQL for safe retries.
6. Admins read the stored audit documents with `GET /api/audit/logs`. The route is admin-only, validates filters with Zod, returns a bounded payload-free list sorted by occurrence time, and reports a clean `503` when MongoDB is not configured or unreachable.

## Database script order

Run the scripts from the project root against the same `smart_parking` database:

1. `database/schema.sql`
2. `database/advanced_features.sql`
3. `database/seed.sql` (optional development data)

`advanced_features.sql` is safe to re-run and adds the additional columns and triggers required by the Member B payment flows to an existing installation.

## Scope boundary

The application includes Member A's parking/allocation flow and Member B's violation, payment, notice, and MongoDB audit interfaces (outbox dispatch plus read-only audit-log retrieval). MongoDB is used only for audit documents; PostgreSQL remains the transactional source of truth. Payment entry records staff-confirmed transactions and does not implement a third-party payment gateway.
