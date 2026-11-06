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
4. The database trigger marks the slot occupied. Partial unique indexes in the integrity migration prevent concurrent duplicate active allocations.
5. On check-out, the API locks the allocation, calls `calculate_parking_fee`, records the check-out event and changes the allocation to `checked_out`.
6. The database trigger releases the slot. The dashboard reads current occupancy from PostgreSQL.

## Setup lifecycle

The `/setup` page can create the first administrator only while `staff_users` is empty. A PostgreSQL advisory transaction lock makes the first-admin check safe against parallel requests. Later users sign in at `/login`.

## Database script order

Run the scripts from the project root against the same `smart_parking` database:

1. `database/schema.sql`
2. `database/advanced_features.sql`
3. `database/migrations/002_integrity_hardening.sql`
4. `database/seed.sql` (optional development data)

The schema and migration are intentionally kept separate so the base relational design is readable and the hardening changes can be reapplied to an existing development database.

## Scope boundary

This implementation provides Member A's parking and allocation flow plus shared authentication, database integrity and dashboard reporting. The Member B APIs, payment/violation/notice user interfaces and MongoDB audit-log worker remain owned by Member B and must be integrated with the shared schema and outbox.
