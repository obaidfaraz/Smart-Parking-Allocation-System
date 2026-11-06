# Smart Parking Allocation & Violation Management System

This project is a DBMS assignment for a smart parking platform. It models parking areas, slot allocation, active occupancy, traffic violation enforcement, payment settlement, and automated notices.

## Team roles and responsibilities

### Developer A: Parking and allocation module
- parking_areas
- parking_slots
- drivers
- vehicles
- driver_vehicles
- allocations
- check_in_out_events
- occupancy_snapshot

### Member B: Violation and payment module
- violation_types
- violations
- payments
- violation_payments
- notices
- audit_outbox

## Final business decisions

1. Driver-vehicle relationships are historical and support many-to-many mappings through driver_vehicles.
2. Violations are generated automatically after a rule is evaluated.
3. A violation can only be created for an ACTIVE allocation.
4. One payment can settle multiple violations through violation_payments.
5. Notices are generated automatically for relevant events such as violation issuance, overdue fine, payment reminder, or dispute notice.
6. Roles are restricted to admin and parking_staff.

## Setup

```bash
cd C:\Users\surya\Desktop\DBMS_miniproject
npm install
npm run dev
```

Then open http://localhost:3000 in the browser.

## Production build

```bash
cd C:\Users\surya\Desktop\DBMS_miniproject
npm run build
```

## Database schema

The PostgreSQL schema is located in `database/schema.sql` and includes the table design, triggers, constraints, helper functions, and indexes for the parking and violation workflows.

## Notes

- Do not commit or push changes as part of this task.
- Member B focuses on violation, payment, and notice logic, while Developer A covers parking allocation and occupancy tracking.
