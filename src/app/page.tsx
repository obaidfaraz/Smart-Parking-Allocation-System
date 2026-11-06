const developerA = [
  "parking_areas",
  "parking_slots",
  "drivers",
  "vehicles",
  "driver_vehicles",
  "allocations",
  "check_in_out_events",
  "occupancy_snapshot",
];

const developerB = [
  "violation_types",
  "violations",
  "payments",
  "violation_payments",
  "notices",
  "audit_outbox",
];

const rules = [
  "Driver-vehicle relationships are historical and support many-to-many mappings through driver_vehicles.",
  "Violations are generated only for active allocations, never historical ones.",
  "One payment can settle multiple violations through violation_payments.",
  "Notices are generated automatically when business rules trigger them.",
  "Roles are restricted to admin and parking_staff.",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 lg:px-12">
        <header className="mb-10 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-sm">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-cyan-400">
            DBMS project
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            Smart Parking Allocation &amp; Violation Management System
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-slate-300">
            A PostgreSQL-first solution for managing parking areas, active allocations,
            violation generation, payment settlement, and notice dispatch.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            ["Parking Areas", "8 core tables"],
            ["Active Allocations", "Slot + vehicle checks"],
            ["Violation Flow", "Open → pending → paid"],
            ["Notice Engine", "Automated dispatch"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
            >
              <p className="text-sm text-slate-400">{label}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-6">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Developer A
            </p>
            <h2 className="text-2xl font-semibold text-white">Parking and allocation module</h2>
            <ul className="mt-5 space-y-2 text-slate-200">
              {developerA.map((table) => (
                <li key={table} className="flex items-center gap-3">
                  <span className="inline-block h-2 w-2 rounded-full bg-cyan-400" />
                  {table}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-violet-500/30 bg-violet-500/5 p-6">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">
              Member B
            </p>
            <h2 className="text-2xl font-semibold text-white">Violation and payment module</h2>
            <ul className="mt-5 space-y-2 text-slate-200">
              {developerB.map((table) => (
                <li key={table} className="flex items-center gap-3">
                  <span className="inline-block h-2 w-2 rounded-full bg-violet-400" />
                  {table}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-12 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Final business rules
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {rules.map((rule) => (
              <div key={rule} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-slate-200">
                {rule}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
