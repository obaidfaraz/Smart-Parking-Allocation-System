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

## Integrity and advanced DBMS evidence

| Concept | Implementation | Evidence to run or inspect |
|---|---|---|
| Normalization and relationship history | `driver_vehicles` separates driver/vehicle assignments; `driver_phones` stores multiple phone numbers; `violation_payments` resolves payment/fine settlement | `schema.sql`, `advanced_features.sql`, [data dictionary](data-dictionary.md) |
| Transactions and row locking | Check-in locks a slot; check-out locks an allocation; fine settlement locks payment and violation rows before applying amounts | Allocation routes, `validate_violation_payment_amounts`; both SQL smoke tests |
| Partial unique indexes | One active allocation per slot and per vehicle, enforced even when requests race | `ux_active_allocation_slot`, `ux_active_allocation_vehicle`; Member A smoke test |
| Triggers and helper functions | Allocation validation/synchronization, parking fee calculation, payment limits and notice status synchronization | `advanced_features.sql`; Member A and B smoke tests |
| View and aggregate reporting | `parking_area_occupancy` provides current counts; the final query in `queries.sql` uses `GROUP BY` and `HAVING` to select active areas above 50% of configured capacity | `database/tests/occupancy_report.sql` tests strict threshold, empty and inactive cases |
| Two database paradigms | Relational business data in PostgreSQL; flexible JSON payload copies in MongoDB | Dispatch then read through Audit outbox / Audit logs; browser tests 11-14 |
| Transactional outbox and idempotency | Business event and transaction commit together; Mongo upsert uses a unique `audit_id` derived from `outbox_id` | Dispatch twice; inspect count and PostgreSQL delivery status |

The diagrams show the physical foreign keys, not inferred business relationships. Violation snapshot keys are intentional duplication: the helper copies driver/vehicle/slot IDs from the allocation when issuing the fine. `drivers.phone` remains a compatibility field alongside normalized `driver_phones`; do not describe the schema as eliminating all duplication.

## Roles and API boundaries

| Operation | Admin | Parking staff |
|---|---|---|
| Read operational records; check in/out; issue violations; record payments/notices | Yes | Yes |
| Create/modify areas, slots, drivers, vehicles; create violation types | Yes | No |
| Dispute an open/pending fine | Yes | Yes |
| Waive a fine or close a paid/waived fine | Yes | No |
| Inspect audit outbox, dispatch to MongoDB, read MongoDB audit logs | Yes | No |

Handlers call `requireUser` on the server; hiding a UI control is not the permission check. Zod rejects invalid request values before database work. Auth uses an environment-provided JWT secret and bcrypt password hashes. Credentials, database URLs and JWT secrets must stay outside Git.

## Failure and consistency boundaries

- PostgreSQL failure blocks transactional operations. Failed transactions roll back their writes; the client receives an API error rather than a partial success.
- MongoDB is not part of the PostgreSQL transaction. Its outage does not prevent parking work or the creation of outbox records. Dispatch failures increment retry state and can be retried, up to ten attempts per event.
- There is no automatic background worker in this repository. An admin explicitly dispatches at most 50 events per request. Unsent events will not appear in Audit logs until a dispatch succeeds.
- Audit-log reads return summaries and metadata, not full payloads. Default limit is 50, maximum 200. API filters support exact event/entity/actor/entity-ID values and an inclusive ISO timestamp range; the UI exposes event/entity, order and limit.
- A waived violation retains its original fine for history, but the violations API reports zero outstanding. The payable KPI counts open/pending_payment fines only. A disputed fine can still display its recorded balance while being excluded from that KPI.
- `occupancy_snapshot` is optional and is not populated by current app routes. Live occupancy comes from `parking_slots.current_status` and the view, not snapshots or the legacy `is_available` flag.

## Diagram and demo guide

See [ER diagram guide](diagrams/README.md) for rendered physical relationships and editable sources. For a demo, apply scripts in order, run all SQL tests, create a staff session, check in/out, issue a fine, record a payment or waiver, then dispatch and read its audit events. Follow [test cases](test-cases.md) for expected results. Application screenshots are a separate later deliverable and are not included here.
