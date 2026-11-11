# Parking and enforcement test cases

## Automated SQL smoke test

Run after applying the schema and advanced features:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/member_a_smoke.sql
```

The script runs in a transaction and rolls back its fixture records. It verifies that:

1. An active allocation occupies its slot.
2. A second active allocation cannot reuse the same slot.
3. The parking fee function rounds any started hour up, with a one-hour minimum.
4. Checking out releases the slot and records the calculated fee.

## Member B transactional SQL smoke test

Run after applying `schema.sql` and `advanced_features.sql`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/member_b_smoke.sql
```

The test rolls back its fixtures and checks:

1. Violations are created for active allocations and rejected for checked-out allocations.
2. Repeating a notice event returns the original notice.
3. One payment can settle violations across two vehicles associated with the same driver.
4. Settling a violation marks its notice paid and records outbox events.
5. A parking-fee payment cannot exceed its checked-out allocation's fee or be applied to a violation.

## API and browser checks

1. Visit `/setup` with a configured database and create an administrator. A second setup attempt must return `409`.
2. Sign in at `/login` with the created account. Requests to `/api/dashboard` without a session must return `401`.
3. Create an area, add slots up to its configured capacity, and confirm the next slot is rejected.
4. Register a driver and vehicle. Try an allocation using a different driver's vehicle; it must be rejected.
5. Check in a vehicle and confirm the dashboard and slot inventory both show the slot occupied.
6. Attempt a second allocation using the occupied slot or same active vehicle; it must be rejected without a partial event or slot update.
7. Check out the active allocation. Confirm the slot becomes available, an event is recorded, and the fee is shown.
8. Sign in as `parking_staff`; reads and allocations are available, while area, slot, driver and vehicle creation/modification are forbidden.
9. At `/enforcement`, create a violation and verify its notice and outbox events appear; record a fine payment and confirm the violation/notice states update.
10. Record a parking payment against a checked-out allocation. Attempt an amount above the remaining fee; it must return `409`.
11. As an admin, dispatch the audit outbox with MongoDB configured. Verify one document per outbox UUID appears in `audit_logs`; dispatch again and confirm no duplicate audit document is created.
12. Stop MongoDB temporarily and dispatch again. Verify delivery failure is reported and the outbox row remains retryable; restart MongoDB and retry.
13. As an admin, open Enforcement → Audit logs after dispatching. Verify each dispatched event appears once with its summary; apply an event-type or entity-type filter and confirm the register narrows to matching documents.
14. Stop MongoDB temporarily and reload the Audit logs tab. Verify a clear unavailable message is shown and the rest of the workspace keeps working; restart MongoDB and confirm the logs load again.

Record the database version, command output and browser screenshots during the final team test run. Tests requiring a running PostgreSQL service cannot be executed by the application build alone.

## Aggregate report regression

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/queries.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/occupancy_report.sql
```

The regression script creates four temporary fixture areas inside a transaction, executes the above-50% report query, asserts the results and rolls back:

| Fixture | Expected |
|---|---|
| Active, configured capacity 4, occupied 3 | Included, 75.00% |
| Active, configured capacity 4, occupied 2 | Excluded: exactly 50% is not above 50% |
| Active, configured capacity 4, no installed slots | Excluded; no divide-by-zero |
| Inactive, configured capacity 4, occupied 3 | Excluded by `WHERE` before grouping |

`HAVING` filters aggregate groups after `WHERE`; capacity is `parking_areas.total_slots`, not the number of installed slots. Keep the regression SELECT aligned with the last query in `queries.sql` when revising the report.

## Additional negative and lifecycle checks

| Check | Expected result |
|---|---|
| Signed-out `GET /api/audit/logs` | `401` |
| Parking-staff `GET /api/audit/logs` | `403`, even if called without the UI |
| Admin read with `limit=0`, `limit=201`, invalid order or invalid ISO date | `400` |
| Admin read with `from` after `to` | `400` |
| Valid limit 2 and ascending/descending order | At most 2 records in the requested chronological order |
| Filter by a known event/entity | Only matching MongoDB records |
| Waive an open fine with a reason | Status waived; original fine preserved; row outstanding 0; unpaid KPI excludes it; sent/viewed fine notice cancelled |
| Close a paid/waived fine | Allowed for admin; invalid transitions return `409` |
| Record more than a remaining fine or parking charge | Rejected without partially applied payment amounts |

## Validation record (local, 12 November 2026)

Both original SQL smoke tests and the new occupancy-report regression were run against real PostgreSQL. The new report returned no rows for the existing low-occupancy seed/test data, then passed all four controlled boundary fixtures. The fixture transactions rolled back. MongoDB 7.0.14 was used for dispatch/read, filtering, idempotency, outage/recovery and role tests; the merged app production build also passed. These are local checks, not evidence of the user's laptop environment or a multi-client concurrency stress test. Re-run the commands after changing schema or business rules.
