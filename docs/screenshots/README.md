# Application screenshots

Captured from a fresh production build of merged main `de22dc762e9ab63dcce18f9ae2be68eac908abb0` on 12 November 2026 at a 1440px desktop viewport, using real local PostgreSQL and MongoDB.

Only the repository's `database/seed.sql` demonstration records are shown: Main Campus/East Annex, Demo Driver/Sample User, DEMO plates and sample contacts. The local administrator is named Demo Admin. These are synthetic examples, not real drivers, payments or parking incidents. No login/setup screen, credentials or environment values are included.

The demo sequence checks in DEMO-1001 at A-01, issues a Rs500 overstay violation, records a staff-confirmed cash fine payment, then dispatches the five resulting outbox events into MongoDB. Parking revenue is still zero because that parking allocation remains active; the fine payment is separate. Screens are snapshots of successive steps, so the pending-outbox KPI changes after dispatch.

| Screenshot | What it demonstrates |
|---|---|
| [Dashboard](01-dashboard.png) | Area/slot counts and live occupancy |
| [Parking areas](02-parking-areas.png) | Seed facilities, capacity and rates |
| [Slot inventory](03-slot-inventory.png) | Available and occupied slot states |
| [Drivers](04-drivers.png) | Seed driver records with synthetic contacts |
| [Vehicles](05-vehicles.png) | Seed vehicles and driver associations |
| [Allocations](06-allocations.png) | Active session for DEMO-1001 |
| [Violations](07-violations.png) | Paid fine with zero outstanding balance |
| [Payments](08-payments.png) | Recorded demonstration fine payment |
| [Notices](09-notices.png) | Fine notice synchronized to paid |
| [Audit outbox](10-audit-outbox.png) | All five events published |
| [MongoDB audit logs](11-mongodb-audit-logs.png) | Five stored events read back through the app |

These images are presentation evidence, not a substitute for the [test cases](../test-cases.md). To reproduce, use a new development database, apply schema / advanced features / seed in order, create a local admin, and perform the sequence above. Keep any real personal records out of future screenshots. The [ER diagrams](../diagrams/README.md) are separate schema documentation.
