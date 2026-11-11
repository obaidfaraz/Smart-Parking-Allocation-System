"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ModuleTab = "violations" | "payments" | "notices" | "audit" | "auditLogs";

interface ApiFailure {
  error?: string;
}

interface StaffUser {
  fullName: string;
  role: "admin" | "parking_staff";
}

interface ViolationType {
  violation_type_id: number;
  name: string;
  default_fine: string;
  severity: string;
  is_active: boolean;
}

interface Violation {
  violation_id: string;
  violation_number: string;
  allocation_id: string;
  driver_id: string;
  vehicle_id: string;
  violation_type: string;
  description: string;
  issue_time: string;
  fine_amount: string;
  outstanding_amount: string;
  status: string;
  driver_name: string;
  license_plate: string;
  area_name: string;
  slot_number: string;
}

interface Allocation {
  allocation_id: string;
  status: string;
  total_fee: string;
  driver_id: string;
  vehicle_id: string;
  driver_name: string;
  license_plate: string;
  area_name: string;
  slot_number: string;
}

interface Driver {
  driver_id: string;
  first_name: string;
  last_name: string;
}

interface Payment {
  payment_id: string;
  allocation_id: string | null;
  payment_category: "parking_fee" | "violation_fine";
  amount: string;
  payment_status: string;
  payment_method: string;
  created_at: string;
}

interface Notice {
  notice_id: string;
  violation_id: string | null;
  notice_type: string;
  subject: string;
  message: string;
  status: string;
  issued_at: string;
  due_date: string | null;
  driver_name: string;
  violation_number: string | null;
}

interface OutboxEvent {
  outbox_id: string;
  event_type: string;
  aggregate_type: string;
  status: string;
  created_at: string;
  retry_count: number;
  error_message: string | null;
}

interface AuditLogEntry {
  audit_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  actor_type: string;
  actor_id: string;
  occurred_at: string;
  summary: string;
}

class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json()) as T & ApiFailure;
  if (!response.ok) {
    throw new RequestError(
      body.error ?? `Request failed with status ${response.status}.`,
      response.status,
    );
  }
  return body;
}

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const tabs: { id: ModuleTab; label: string }[] = [
  { id: "violations", label: "Violations" },
  { id: "payments", label: "Payments" },
  { id: "notices", label: "Notices" },
  { id: "audit", label: "Audit outbox" },
  { id: "auditLogs", label: "Audit logs" },
];

export default function EnforcementWorkspace() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [activeTab, setActiveTab] = useState<ModuleTab>("violations");
  const [violationTypes, setViolationTypes] = useState<ViolationType[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [outbox, setOutbox] = useState<OutboxEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditReadError, setAuditReadError] = useState("");
  const [auditEventTypes, setAuditEventTypes] = useState<string[]>([]);
  const [auditEntityTypes, setAuditEntityTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [paymentCategory, setPaymentCategory] = useState<
    "parking_fee" | "violation_fine"
  >("violation_fine");

  const loadData = useCallback(async () => {
    setError("");
    try {
      const session = await requestJson<{
        user: StaffUser | null;
        setupRequired: boolean;
      }>("/api/auth/session");
      setUser(session.user);
      setSetupRequired(session.setupRequired);
      if (!session.user) {
        setAuthRequired(true);
        return;
      }

      setAuthRequired(false);
      const [typeResult, violationResult, allocationResult, driverResult, paymentResult, noticeResult] =
        await Promise.all([
          requestJson<{ violationTypes: ViolationType[] }>("/api/violation-types"),
          requestJson<{ violations: Violation[] }>("/api/violations"),
          requestJson<{ allocations: Allocation[] }>("/api/allocations"),
          requestJson<{ drivers: Driver[] }>("/api/drivers"),
          requestJson<{ payments: Payment[] }>("/api/payments"),
          requestJson<{ notices: Notice[] }>("/api/notices"),
        ]);
      setViolationTypes(typeResult.violationTypes);
      setViolations(violationResult.violations);
      setAllocations(allocationResult.allocations);
      setDrivers(driverResult.drivers);
      setSelectedDriverId((current) => {
        if (current && driverResult.drivers.some((driver) => driver.driver_id === current)) {
          return current;
        }
        const unpaidDriverIds = new Set(
          violationResult.violations
            .filter((violation) => Number(violation.outstanding_amount) > 0)
            .map((violation) => violation.driver_id),
        );
        return driverResult.drivers.find((driver) => unpaidDriverIds.has(driver.driver_id))?.driver_id ?? "";
      });
      setPayments(paymentResult.payments);
      setNotices(noticeResult.notices);

      if (session.user.role === "admin") {
        const outboxResult = await requestJson<{ events: OutboxEvent[] }>(
          "/api/audit/outbox",
        );
        setOutbox(outboxResult.events);
      } else {
        setOutbox([]);
      }
    } catch (requestError) {
      if (requestError instanceof RequestError && requestError.status === 401) {
        setAuthRequired(true);
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load enforcement data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const loadAuditLogs = useCallback(
    async (params?: {
      eventType?: string;
      entityType?: string;
      limit?: string;
      order?: string;
    }) => {
      setError("");
      setAuditReadError("");
      setAuditLoading(true);
      try {
        const search = new URLSearchParams();
        if (params?.eventType) {
          search.set("eventType", params.eventType);
        }
        if (params?.entityType) {
          search.set("entityType", params.entityType);
        }
        if (params?.limit) {
          search.set("limit", params.limit);
        }
        if (params?.order) {
          search.set("order", params.order);
        }
        const suffix = search.toString();
        const result = await requestJson<{
          logs: AuditLogEntry[];
          eventTypes: string[];
          entityTypes: string[];
        }>(`/api/audit/logs${suffix ? `?${suffix}` : ""}`);
        setAuditLogs(result.logs);
        setAuditEventTypes(result.eventTypes);
        setAuditEntityTypes(result.entityTypes);
      } catch (requestError) {
        setAuditLogs([]);
        setAuditReadError("Audit logs could not be loaded.");
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load audit logs.",
        );
      } finally {
        setAuditLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (activeTab !== "auditLogs" || user?.role !== "admin") {
      return;
    }
    const timer = window.setTimeout(() => {
      void loadAuditLogs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, user?.role, loadAuditLogs]);

  const outstandingViolations = useMemo(
    () =>
      violations.filter(
        (violation) =>
          Number(violation.outstanding_amount) > 0 &&
          ["open", "pending_payment"].includes(violation.status),
      ),
    [violations],
  );

  const outstandingParkingAllocations = useMemo(
    () =>
      allocations
        .filter((allocation) => allocation.status === "checked_out")
        .map((allocation) => {
          const paid = payments
            .filter(
              (payment) =>
                payment.payment_category === "parking_fee" &&
                payment.payment_status === "success" &&
                payment.allocation_id === allocation.allocation_id,
            )
            .reduce((sum, payment) => sum + Number(payment.amount), 0);
          return {
            ...allocation,
            outstanding: Math.max(Number(allocation.total_fee) - paid, 0),
          };
        })
        .filter((allocation) => allocation.outstanding > 0),
    [allocations, payments],
  );

  async function submit(
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(successMessage);
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The request could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function createViolation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit(
      () =>
        requestJson("/api/violations", {
          method: "POST",
          body: JSON.stringify({
            allocationId: form.get("allocationId"),
            violationTypeId: form.get("violationTypeId"),
            description: form.get("description"),
          }),
        }),
      "Violation recorded and fine notice created.",
    );
    event.currentTarget.reset();
  }

  function createFinePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedIds = form.getAll("selectedViolation").map(String);
    if (!selectedIds.length) {
      setError("Select at least one outstanding violation to record a payment.");
      return;
    }
    const applications = selectedIds.map((violationId) => ({
      violationId,
      amountApplied: Number(form.get(`amount-${violationId}`)),
    }));
    const amount = applications.reduce(
      (total, application) => total + application.amountApplied,
      0,
    );
    void submit(
      () =>
        requestJson("/api/payments", {
          method: "POST",
          body: JSON.stringify({
            paymentCategory: "violation_fine",
            driverId: form.get("driverId"),
            paymentMethod: form.get("paymentMethod"),
            amount: amount.toFixed(2),
            applications,
          }),
        }),
      "Violation payment recorded and applied.",
    );
    event.currentTarget.reset();
  }

  function createParkingPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit(
      () =>
        requestJson("/api/payments", {
          method: "POST",
          body: JSON.stringify({
            paymentCategory: "parking_fee",
            allocationId: form.get("allocationId"),
            amount: form.get("amount"),
            paymentMethod: form.get("paymentMethod"),
            transactionReference: form.get("transactionReference") || null,
          }),
        }),
      "Parking payment recorded.",
    );
    event.currentTarget.reset();
  }

  function createNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit(
      () =>
        requestJson("/api/notices", {
          method: "POST",
          body: JSON.stringify({
            violationId: form.get("violationId"),
            noticeType: form.get("noticeType"),
            eventRef: `manual:${Date.now()}`,
            subject: form.get("subject"),
            message: form.get("message"),
          }),
        }),
      "Notice recorded.",
    );
    event.currentTarget.reset();
  }

  function updateNotice(noticeId: string, status: string) {
    void submit(
      () =>
        requestJson(`/api/notices/${noticeId}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      `Notice marked ${status}.`,
    );
  }

  function updateViolation(violationId: string, status: string) {
    const reason = window.prompt(`Reason for marking this violation ${status}:`);
    if (!reason?.trim()) {
      return;
    }
    void submit(
      () =>
        requestJson(`/api/violations/${violationId}`, {
          method: "PATCH",
          body: JSON.stringify({ status, reason }),
        }),
      `Violation marked ${status}.`,
    );
  }

  function dispatchAudit() {
    void submit(
      async () => {
        const result = await requestJson<{
          selected: number;
          published: number;
          failures: { outboxId: string; message: string }[];
          message: string;
        }>("/api/audit/dispatch", { method: "POST" });
        if (result.failures.length) {
          throw new Error(
            `${result.message} ${result.published} published; ${result.failures.length} failed.`,
          );
        }
        return result;
      },
      "Audit events dispatched to MongoDB.",
    );
  }

  function applyAuditLogFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void loadAuditLogs({
      eventType: String(form.get("eventType") ?? "") || undefined,
      entityType: String(form.get("entityType") ?? "") || undefined,
      order: String(form.get("order") ?? "") || undefined,
      limit: String(form.get("limit") ?? "") || undefined,
    });
  }

  const selectedDriverViolations = outstandingViolations.filter(
    (violation) => violation.driver_id === selectedDriverId,
  );

  if (loading) {
    return (
      <main className="loading-screen">
        <span className="loading-spinner" /> Loading enforcement workspace…
      </main>
    );
  }

  if (authRequired) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <span className="brand-mark">P</span>
          <h1>Sign in required</h1>
          <p className="muted">
            {error || "Sign in to manage violations, payments, notices, and audit events."}
          </p>
          <Link className="button primary-button" href={setupRequired ? "/setup" : "/login"}>
            {setupRequired ? "Set up administrator" : "Go to sign in"}
          </Link>
        </section>
      </main>
    );
  }

  const currentLabel = tabs.find((tab) => tab.id === activeTab)?.label;
  const totalOutstandingFine = outstandingViolations.reduce(
    (sum, violation) => sum + Number(violation.outstanding_amount),
    0,
  );
  const pendingOutbox = outbox.filter((event) =>
    ["pending", "failed"].includes(event.status),
  ).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand-lockup" href="/" aria-label="Parkwise home">
          <span className="brand-mark">P</span>
          <span>
            <strong>Parkwise</strong>
            <small>CONTROL CENTER</small>
          </span>
        </Link>
        <div className="nav-section-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <Link className="nav-link" href="/">
            <span className="nav-icon">⌂</span> Parking operations
          </Link>
          {tabs.filter((tab) => (tab.id !== "audit" && tab.id !== "auditLogs") || user?.role === "admin").map((tab) => (
            <button
              className={`nav-link ${activeTab === tab.id ? "active" : ""}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <span className="nav-icon">
                {tab.id === "violations"
                  ? "!"
                  : tab.id === "payments"
                    ? "₹"
                    : tab.id === "notices"
                      ? "✉"
                      : "◷"}
              </span>
              {tab.label}
              {activeTab === tab.id && <span className="nav-marker" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="database-status">
            <span className="status-dot" />
            <span>
              <strong>PostgreSQL connected</strong>
              <small>Operational records</small>
            </span>
          </div>
          <div className="profile-block">
            <span className="avatar">{user?.fullName.slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy">
              <strong>{user?.fullName}</strong>
              <small>{user?.role.replace("_", " ")}</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {currentLabel}
          </div>
          <div className="topbar-right">
            <span className="today-label">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
            <button className="button secondary-button small-button" onClick={() => void loadData()} type="button">
              Refresh
            </button>
          </div>
        </header>

        <div className="page-content">
          {(error || message) && (
            <div className={`notice ${error ? "error-notice" : "success-notice"}`} role={error ? "alert" : "status"}>
              <span>{error || message}</span>
              <button onClick={() => { setError(""); setMessage(""); }} aria-label="Dismiss notification" type="button">×</button>
            </div>
          )}

          <section className="panel-heading">
            <div>
              <p className="eyebrow">ENFORCEMENT &amp; SETTLEMENT</p>
              <h2>Violations, payments &amp; notices</h2>
              <p className="muted">Manage fines, parking fee collection, driver notices, and the MongoDB audit outbox.</p>
            </div>
          </section>

          <section className="metric-grid enforcement-metrics">
            <div className="metric-card"><span className="metric-icon amber">!</span><p>Unpaid violations</p><strong>{outstandingViolations.length}</strong><span className="metric-meta">Across all drivers</span></div>
            <div className="metric-card"><span className="metric-icon violet">₹</span><p>Outstanding fines</p><strong>{currency.format(totalOutstandingFine)}</strong><span className="metric-meta">Remaining balance</span></div>
            <div className="metric-card"><span className="metric-icon mint">✉</span><p>Open notices</p><strong>{notices.filter((notice) => ["sent", "viewed"].includes(notice.status)).length}</strong><span className="metric-meta">Sent or viewed</span></div>
            <div className="metric-card"><span className="metric-icon blue">◷</span><p>Audit events pending</p><strong>{user?.role === "admin" ? pendingOutbox : "Admin"}</strong><span className="metric-meta">PostgreSQL outbox</span></div>
          </section>

          <nav className="enforcement-tabs" aria-label="Enforcement modules">
            {tabs.filter((tab) => (tab.id !== "audit" && tab.id !== "auditLogs") || user?.role === "admin").map((tab) => (
              <button
                className={activeTab === tab.id ? "selected" : ""}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === "violations" && (
            <>
              <section className="card form-card">
                <div className="section-title"><div><h3>Issue a violation</h3><p>Only active allocations can receive a new violation; a fine notice is generated in the same transaction.</p></div></div>
                <form className="enforcement-form" onSubmit={createViolation}>
                  <label className="form-field">Active allocation
                    <select name="allocationId" required defaultValue="">
                      <option value="" disabled>Select allocation</option>
                      {allocations.filter((allocation) => allocation.status === "active").map((allocation) => (
                        <option key={allocation.allocation_id} value={allocation.allocation_id}>
                          {allocation.license_plate} · {allocation.area_name} / {allocation.slot_number}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">Violation type
                    <select name="violationTypeId" required defaultValue="">
                      <option value="" disabled>Select type</option>
                      {violationTypes.filter((type) => type.is_active).map((type) => (
                        <option key={type.violation_type_id} value={type.violation_type_id}>
                          {type.name} · {currency.format(Number(type.default_fine))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">Description
                    <input name="description" required minLength={3} maxLength={2000} placeholder="Describe the rule condition" />
                  </label>
                  <button className="button primary-button form-actions" disabled={busy || !violationTypes.some((type) => type.is_active)} type="submit">Issue violation</button>
                </form>
                {!violationTypes.some((type) => type.is_active) && <p className="field-hint">No active violation types are configured. Add types to violation_types or ask an administrator.</p>}
              </section>
              <section className="card table-card">
                <div className="section-title"><div><h3>Violation register</h3><p>Fine balance is calculated from successful payment applications.</p></div></div>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Violation</th><th>Driver / vehicle</th><th>Location</th><th>Fine</th><th>Outstanding</th><th>Status</th><th>Issued</th><th>Actions</th></tr></thead>
                    <tbody>
                      {violations.map((violation) => (
                        <tr key={violation.violation_id}>
                          <td><strong>{violation.violation_number}</strong><small>{violation.violation_type} · {violation.description}</small></td>
                          <td><strong>{violation.driver_name}</strong><small>{violation.license_plate}</small></td>
                          <td>{violation.area_name}<small>{violation.slot_number}</small></td>
                          <td>{currency.format(Number(violation.fine_amount))}</td>
                          <td>{currency.format(Number(violation.outstanding_amount))}</td>
                          <td><span className={`badge ${violation.status}`}>{violation.status.replace("_", " ")}</span></td>
                          <td>{new Date(violation.issue_time).toLocaleDateString("en-IN")}</td>
                          <td className="row-actions">
                            {["open", "pending_payment"].includes(violation.status) && <button className="text-button" disabled={busy} onClick={() => updateViolation(violation.violation_id, "disputed")} type="button">Dispute</button>}
                            {user?.role === "admin" && ["open", "pending_payment", "disputed"].includes(violation.status) && <button className="text-button" disabled={busy} onClick={() => updateViolation(violation.violation_id, "waived")} type="button">Waive</button>}
                            {user?.role === "admin" && ["paid", "waived"].includes(violation.status) && <button className="text-button" disabled={busy} onClick={() => updateViolation(violation.violation_id, "closed")} type="button">Close</button>}
                          </td>
                        </tr>
                      ))}
                      {!violations.length && <tr><td colSpan={8} className="empty-state">No violations recorded.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {activeTab === "payments" && (
            <>
              <nav className="enforcement-tabs payment-tabs" aria-label="Payment category">
                <button className={paymentCategory === "violation_fine" ? "selected" : ""} onClick={() => setPaymentCategory("violation_fine")} type="button">Violation fines</button>
                <button className={paymentCategory === "parking_fee" ? "selected" : ""} onClick={() => setPaymentCategory("parking_fee")} type="button">Parking fees</button>
              </nav>
              {paymentCategory === "violation_fine" ? (
                <section className="card form-card">
                  <div className="section-title"><div><h3>Record a fine payment</h3><p>Select one driver and one or more outstanding violations. Applied amounts must equal the payment total.</p></div></div>
                  <form className="enforcement-form" onSubmit={createFinePayment}>
                    <label className="form-field">Driver
                      <select
                        name="driverId"
                        onChange={(event) => setSelectedDriverId(event.target.value)}
                        required
                        value={selectedDriverId}
                      >
                        <option value="" disabled>Select driver</option>
                        {drivers.filter((driver) => outstandingViolations.some((violation) => violation.driver_id === driver.driver_id)).map((driver) => (
                          <option key={driver.driver_id} value={driver.driver_id}>{driver.first_name} {driver.last_name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">Payment method
                      <select name="paymentMethod" defaultValue="cash">
                        <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="wallet">Wallet</option>
                      </select>
                    </label>
                    <div className="enforcement-wide">
                      <p className="field-hint">Choose violation(s) and set the amount applied for each. One payment can settle multiple fines.</p>
                      <div className="application-list">
                        {selectedDriverViolations.map((violation) => (
                          <label className="application-row" key={violation.violation_id}>
                            <input name="selectedViolation" type="checkbox" value={violation.violation_id} />
                            <span><strong>{violation.violation_number} · {violation.driver_name}</strong><small>{violation.license_plate} · outstanding {currency.format(Number(violation.outstanding_amount))}</small></span>
                            <input
                              aria-label={`Amount applied to ${violation.violation_number}`}
                              className="application-amount"
                              defaultValue={Number(violation.outstanding_amount).toFixed(2)}
                              max={violation.outstanding_amount}
                              min="0.01"
                              name={`amount-${violation.violation_id}`}
                              step="0.01"
                              type="number"
                            />
                          </label>
                        ))}
                        {!selectedDriverViolations.length && <p className="empty-state">Select a driver with an unpaid fine, or no unpaid fines are available.</p>}
                      </div>
                    </div>
                    <button className="button primary-button form-actions" disabled={busy || !outstandingViolations.length} type="submit">Record fine payment</button>
                  </form>
                </section>
              ) : (
                <section className="card form-card">
                  <div className="section-title"><div><h3>Record a parking payment</h3><p>Collects all or part of the computed fee for a checked-out parking session.</p></div></div>
                  <form className="enforcement-form" onSubmit={createParkingPayment}>
                    <label className="form-field enforcement-wide">Checked-out allocation
                      <select name="allocationId" required defaultValue="">
                        <option value="" disabled>Select allocation</option>
                        {outstandingParkingAllocations.map((allocation) => (
                          <option key={allocation.allocation_id} value={allocation.allocation_id}>
                            {allocation.license_plate} · {allocation.area_name} / {allocation.slot_number} · due {currency.format(allocation.outstanding)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">Amount
                      <input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" />
                    </label>
                    <label className="form-field">Payment method
                      <select name="paymentMethod" defaultValue="cash">
                        <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="wallet">Wallet</option>
                      </select>
                    </label>
                    <label className="form-field">Transaction reference
                      <input name="transactionReference" maxLength={80} placeholder="Optional" />
                    </label>
                    <button className="button primary-button form-actions" disabled={busy || !outstandingParkingAllocations.length} type="submit">Record parking payment</button>
                  </form>
                  {!outstandingParkingAllocations.length && <p className="empty-state">No checked-out allocations have an unpaid parking balance.</p>}
                </section>
              )}
              <section className="card table-card">
                <div className="section-title"><div><h3>Payment history</h3><p>Parking charges and violation-fine transactions are recorded separately.</p></div></div>
                <div className="table-scroll"><table>
                  <thead><tr><th>Category</th><th>Payment</th><th>Method</th><th>Amount</th><th>Status</th><th>Recorded</th></tr></thead>
                  <tbody>{payments.map((payment) => (
                    <tr key={payment.payment_id}>
                      <td>{payment.payment_category === "parking_fee" ? "Parking fee" : "Violation fine"}</td>
                      <td><strong>{payment.payment_id.slice(0, 8)}</strong><small>{payment.allocation_id ? "Parking allocation" : "Violation settlement"}</small></td>
                      <td>{payment.payment_method.replace("_", " ")}</td>
                      <td>{currency.format(Number(payment.amount))}</td>
                      <td><span className={`badge ${payment.payment_status}`}>{payment.payment_status}</span></td>
                      <td>{new Date(payment.created_at).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))}{!payments.length && <tr><td colSpan={6} className="empty-state">No payments recorded.</td></tr>}</tbody>
                </table></div>
              </section>
            </>
          )}

          {activeTab === "notices" && (
            <>
              <section className="card form-card">
                <div className="section-title"><div><h3>Create a notice</h3><p>Notices are saved with a seven-day due date and deduplicated by event reference.</p></div></div>
                <form className="enforcement-form" onSubmit={createNotice}>
                  <label className="form-field">Violation
                    <select name="violationId" required defaultValue="">
                      <option value="" disabled>Select violation</option>
                      {violations.map((violation) => <option key={violation.violation_id} value={violation.violation_id}>{violation.violation_number} · {violation.driver_name}</option>)}
                    </select>
                  </label>
                  <label className="form-field">Notice type
                    <select name="noticeType" defaultValue="payment_reminder">
                      <option value="fine_notice">Fine notice</option><option value="payment_reminder">Payment reminder</option><option value="overdue_notice">Overdue notice</option><option value="dispute_notice">Dispute notice</option>
                    </select>
                  </label>
                  <label className="form-field">Subject
                    <input name="subject" required minLength={2} maxLength={200} placeholder="Notice subject" />
                  </label>
                  <label className="form-field enforcement-wide">Message
                    <textarea name="message" required minLength={2} maxLength={5000} placeholder="Message for the driver" rows={3} />
                  </label>
                  <button className="button primary-button form-actions" disabled={busy || !violations.length} type="submit">Create notice</button>
                </form>
              </section>
              <section className="card table-card">
                <div className="section-title"><div><h3>Notice register</h3><p>Communication status is tracked separately from violation status.</p></div></div>
                <div className="table-scroll"><table>
                  <thead><tr><th>Notice</th><th>Driver</th><th>Violation</th><th>Due</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>{notices.map((notice) => (
                    <tr key={notice.notice_id}>
                      <td><strong>{notice.subject}</strong><small>{notice.notice_type.replaceAll("_", " ")}</small></td>
                      <td>{notice.driver_name}</td>
                      <td>{notice.violation_number ?? "—"}</td>
                      <td>{notice.due_date ? new Date(notice.due_date).toLocaleDateString("en-IN") : "—"}</td>
                      <td><span className={`badge ${notice.status}`}>{notice.status}</span></td>
                      <td>{notice.status === "sent" && <button className="text-button" disabled={busy} onClick={() => updateNotice(notice.notice_id, "viewed")} type="button">Mark viewed</button>}
                        {["sent", "viewed"].includes(notice.status) && <button className="text-button" disabled={busy} onClick={() => updateNotice(notice.notice_id, "cancelled")} type="button">Cancel</button>}</td>
                    </tr>
                  ))}{!notices.length && <tr><td colSpan={6} className="empty-state">No notices recorded.</td></tr>}</tbody>
                </table></div>
              </section>
            </>
          )}

          {activeTab === "audit" && user?.role === "admin" && (
            <>
              <section className="card form-card audit-actions">
                <div className="section-title"><div><h3>MongoDB audit delivery</h3><p>PostgreSQL is the source of truth. Dispatch is idempotent and can be retried if MongoDB is unavailable.</p></div>
                  <button className="button primary-button" disabled={busy} onClick={dispatchAudit} type="button">Dispatch up to 50 events</button>
                </div>
              </section>
              <section className="card table-card">
                <div className="section-title"><div><h3>Audit outbox</h3><p>Failed events remain available for retry up to ten attempts.</p></div></div>
                <div className="table-scroll"><table>
                  <thead><tr><th>Event</th><th>Entity</th><th>Status</th><th>Attempts</th><th>Created</th><th>Last error</th></tr></thead>
                  <tbody>{outbox.map((event) => (
                    <tr key={event.outbox_id}>
                      <td><strong>{event.event_type.replaceAll("_", " ")}</strong><small>{event.outbox_id.slice(0, 8)}</small></td>
                      <td>{event.aggregate_type}</td>
                      <td><span className={`badge ${event.status}`}>{event.status}</span></td>
                      <td>{event.retry_count}</td>
                      <td>{new Date(event.created_at).toLocaleString("en-IN")}</td>
                      <td>{event.error_message ?? "—"}</td>
                    </tr>
                  ))}{!outbox.length && <tr><td colSpan={6} className="empty-state">No audit events have been generated.</td></tr>}</tbody>
                </table></div>
              </section>
            </>
          )}

          {activeTab === "auditLogs" && user?.role === "admin" && (
            <>
              <section className="card form-card">
                <div className="section-title"><div><h3>Read audit logs</h3><p>Queries the MongoDB audit documents written by the outbox dispatcher. Dispatch pending events from the Audit outbox tab first.</p></div></div>
                <form className="enforcement-form" onSubmit={applyAuditLogFilters}>
                  <label className="form-field">Event type
                    <select name="eventType" defaultValue="">
                      <option value="">All event types</option>
                      {auditEventTypes.map((eventType) => (
                        <option key={eventType} value={eventType}>
                          {eventType.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">Entity type
                    <select name="entityType" defaultValue="">
                      <option value="">All entities</option>
                      {auditEntityTypes.map((entityType) => (
                        <option key={entityType} value={entityType}>
                          {entityType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">Order
                    <select name="order" defaultValue="desc">
                      <option value="desc">Newest first</option>
                      <option value="asc">Oldest first</option>
                    </select>
                  </label>
                  <label className="form-field">Limit
                    <select name="limit" defaultValue="50">
                      <option value="25">25 events</option>
                      <option value="50">50 events</option>
                      <option value="100">100 events</option>
                      <option value="200">200 events</option>
                    </select>
                  </label>
                  <button className="button primary-button form-actions" disabled={busy || auditLoading} type="submit">{auditLoading ? "Loading logs..." : "Apply filters"}</button>
                </form>
              </section>
              <section className="card table-card">
                <div className="section-title"><div><h3>Audit log register</h3><p>Read-only view of MongoDB audit documents; full payloads remain in the audit store.</p></div></div>
                <div className="table-scroll"><table>
                  <thead><tr><th>Event</th><th>Entity</th><th>Actor</th><th>Occurred</th><th>Summary</th></tr></thead>
                  <tbody>{auditLogs.map((log) => (
                    <tr key={log.audit_id}>
                      <td><strong>{log.event_type.replaceAll("_", " ")}</strong><small>{log.audit_id.slice(0, 8)}</small></td>
                      <td>{log.entity_type}</td>
                      <td>{log.actor_type}</td>
                      <td>{new Date(log.occurred_at).toLocaleString("en-IN")}</td>
                      <td>{log.summary}</td>
                    </tr>
                  ))}{!auditLogs.length && <tr><td colSpan={5} className="empty-state">{auditLoading ? "Loading audit logs..." : auditReadError || "No audit logs match the selected filters."}</td></tr>}</tbody>
                </table></div>
              </section>
            </>
          )}

          <footer className="page-footer">Smart Parking Allocation &amp; Violation Management <span>·</span> Member B enforcement module</footer>
        </div>
      </main>
    </div>
  );
              }
