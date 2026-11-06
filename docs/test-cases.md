# Member A test cases

## Automated SQL smoke test

Run after applying the schema, advanced features and integrity migration:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/member_a_smoke.sql
```

The script runs in a transaction and rolls back its fixture records. It verifies that:

1. An active allocation occupies its slot.
2. A second active allocation cannot reuse the same slot.
3. The parking fee function rounds any started hour up, with a one-hour minimum.
4. Checking out releases the slot and records the calculated fee.

## API and browser checks

1. Visit `/setup` with a configured database and create an administrator. A second setup attempt must return `409`.
2. Sign in at `/login` with the created account. Requests to `/api/dashboard` without a session must return `401`.
3. Create an area, add slots up to its configured capacity, and confirm the next slot is rejected.
4. Register a driver and vehicle. Try an allocation using a different driver's vehicle; it must be rejected.
5. Check in a vehicle and confirm the dashboard and slot inventory both show the slot occupied.
6. Attempt a second allocation using the occupied slot or same active vehicle; it must be rejected without a partial event or slot update.
7. Check out the active allocation. Confirm the slot becomes available, an event is recorded, and the fee is shown.
8. Sign in as `parking_staff`; reads and allocations are available, while area, slot, driver and vehicle creation/modification are forbidden.

Record the database version, command output and browser screenshots during the final team test run. Tests requiring a running PostgreSQL service cannot be executed by the application build alone.
