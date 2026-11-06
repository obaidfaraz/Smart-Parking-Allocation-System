"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Role = "admin" | "parking_staff";
type Tab = "overview" | "areas" | "slots" | "drivers" | "vehicles" | "allocations";

interface User {
  fullName: string;
  email: string;
  role: Role;
}

interface Area {
  area_id: string;
  code: string;
  name: string;
  description: string | null;
  address: string;
  city: string;
  state: string | null;
  hourly_rate: string;
  total_slots: number;
  status: string;
  configured_capacity?: number;
  registered_slots?: number;
  occupied_slots?: number;
  available_slots?: number;
  reserved_slots?: number;
  maintenance_slots?: number;
  blocked_slots?: number;
}

interface Slot {
  slot_id: string;
  area_id: string;
  area_name: string;
  slot_number: string;
  slot_type: string;
  current_status: string;
  floor_number: number | null;
  row_label: string | null;
}

interface Driver {
  driver_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  license_number: string;
  driver_status: string;
}

interface Vehicle {
  vehicle_id: string;
  license_plate: string;
  make: string | null;
  model: string | null;
  vehicle_type: string;
  driver_id: string | null;
  driver_name: string | null;
  is_primary: boolean | null;
  status: string;
}

interface Allocation {
  allocation_id: string;
  slot_id: string;
  vehicle_id: string;
  driver_id: string;
  check_in_time: string;
  actual_check_out_time: string | null;
  status: string;
  total_fee: string;
  slot_number: string;
  area_name: string;
  license_plate: string;
  driver_name: string;
}

interface DashboardTotals {
  parking_areas: string;
  parking_slots: string;
  occupied_slots: string;
  available_slots: string;
  active_allocations: string;
  completed_allocations: string;
  parking_revenue: string;
  total_violations: string;
  outstanding_fines: string;
}

interface DashboardData {
  totals: DashboardTotals;
  areas: Area[];
}

interface ApiError {
  error?: string;
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◫" },
  { id: "areas", label: "Parking areas", icon: "⌂" },
  { id: "slots", label: "Parking slots", icon: "▦" },
  { id: "drivers", label: "Drivers", icon: "♙" },
  { id: "vehicles", label: "Vehicles", icon: "▱" },
  { id: "allocations", label: "Allocations", icon: "↗" },
];

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function prettyDate(date: string) {
  return new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json()) as T & ApiError;
  if (!response.ok) {
    throw new Error(body.error ?? "Request failed.");
  }
  return body;
}

function FormField({
  label,
  name,
  type = "text",
  required = true,
  defaultValue,
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  required = true,
  defaultValue = "",
  onValueChange,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        <option value="" disabled>Select…</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [areaToEdit, setAreaToEdit] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    const [dashboardResult, areaResult, slotResult, driverResult, vehicleResult, allocationResult] =
      await Promise.all([
        requestJson<DashboardData>("/api/dashboard"),
        requestJson<{ areas: Area[] }>("/api/parking/areas"),
        requestJson<{ slots: Slot[] }>("/api/parking/slots"),
        requestJson<{ drivers: Driver[] }>("/api/drivers"),
        requestJson<{ vehicles: Vehicle[] }>("/api/vehicles"),
        requestJson<{ allocations: Allocation[] }>("/api/allocations"),
      ]);
    setDashboard(dashboardResult);
    setAreas(areaResult.areas);
    setSlots(slotResult.slots);
    setDrivers(driverResult.drivers);
    setVehicles(vehicleResult.vehicles);
    setAllocations(allocationResult.allocations);
  }, []);

  useEffect(() => {
    let active = true;
    requestJson<{ user: User | null; setupRequired: boolean }>("/api/auth/session")
      .then(async (session) => {
        if (!active) return;
        if (!session.user) {
          router.replace(session.setupRequired ? "/setup" : "/login");
          return;
        }
        setUser(session.user);
        await loadData();
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load the dashboard.");
        }
      });
    return () => {
      active = false;
    };
  }, [loadData, router]);

  const isAdmin = user?.role === "admin";
  const availableSlots = useMemo(
    () => slots.filter((slot) => slot.current_status === "available"),
    [slots],
  );

  async function refresh() {
    setError("");
    try {
      await loadData();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to refresh data.");
    }
  }

  async function submitForm(
    event: FormEvent<HTMLFormElement>,
    endpoint: string,
    method: "POST" | "PUT",
    extra: Record<string, unknown> = {},
  ) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload: Record<string, unknown> = { ...extra };
    for (const [key, value] of formData.entries()) {
      if (value instanceof File || value === "") continue;
      if (key === "isPrimary") {
        payload[key] = value === "true";
      } else if (key === "expectedCheckOutTime") {
        payload[key] = new Date(String(value)).toISOString();
      } else {
        payload[key] = value;
      }
    }

    try {
      await requestJson(endpoint, { method, body: JSON.stringify(payload) });
      setMessage(method === "PUT" ? "Parking area updated." : "Record added successfully.");
      setAreaToEdit(null);
      form.reset();
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save record.");
    } finally {
      setBusy(false);
    }
  }

  async function updateSlot(slot: Slot, currentStatus: string) {
    setError("");
    try {
      await requestJson(`/api/parking/slots/${slot.slot_id}`, {
        method: "PATCH",
        body: JSON.stringify({ currentStatus }),
      });
      setMessage(`${slot.slot_number} status updated.`);
      await loadData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update the slot.");
    }
  }

  async function checkout(allocation: Allocation) {
    setError("");
    try {
      const result = await requestJson<{ allocation: Allocation }>(
        `/api/allocations/${allocation.allocation_id}/checkout`,
        { method: "POST" },
      );
      setMessage(
        `Check-out complete. Parking charge: ${currency.format(Number(result.allocation.total_fee))}.`,
      );
      await loadData();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to check out.");
    }
  }

  async function signOut() {
    await requestJson("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function panelHeading(eyebrow: string, title: string, description: string) {
    return (
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        <button className="button secondary-button" onClick={refresh} type="button">Refresh data</button>
      </div>
    );
  }

  function renderOverview() {
    const totals = dashboard?.totals;
    const metrics = [
      { label: "Parking areas", value: totals?.parking_areas ?? "—", meta: "Active facilities", icon: "⌂", tone: "mint" },
      { label: "Total parking slots", value: totals?.parking_slots ?? "—", meta: `${totals?.available_slots ?? 0} available right now`, icon: "▦", tone: "blue" },
      { label: "Active allocations", value: totals?.active_allocations ?? "—", meta: `${totals?.occupied_slots ?? 0} slots occupied`, icon: "↗", tone: "violet" },
      { label: "Parking revenue", value: currency.format(Number(totals?.parking_revenue ?? 0)), meta: "Completed check-outs", icon: "₹", tone: "amber" },
    ];

    return (
      <>
        {panelHeading("OPERATIONS SNAPSHOT", "Good morning", "Here’s what’s happening across your parking facilities.")}
        <div className="metric-grid">
          {metrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <span className={`metric-icon ${metric.tone}`}>{metric.icon}</span>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span className="metric-meta">{metric.meta}</span>
            </article>
          ))}
        </div>
        <div className="content-grid">
          <section className="card">
            <div className="section-title">
              <div><h3>Occupancy by area</h3><p>Live status from registered parking slots</p></div>
              <button className="text-button" onClick={() => setActiveTab("areas")} type="button">Manage areas →</button>
            </div>
            <div className="occupancy-list">
              {(dashboard?.areas ?? []).map((area) => {
                const total = Number(area.registered_slots ?? 0);
                const occupied = Number(area.occupied_slots ?? 0);
                const ratio = total ? Math.round((occupied / total) * 100) : 0;
                return (
                  <div className="occupancy-row" key={area.area_id}>
                    <div className="occupancy-top">
                      <div><strong>{area.name}</strong><span>{area.city} · {area.code}</span></div>
                      <b>{occupied}<span> / {total} occupied</span></b>
                    </div>
                    <div className="progress-track"><span style={{ width: `${ratio}%` }} /></div>
                    <div className="occupancy-bottom">
                      <span>{Number(area.available_slots ?? 0)} available</span>
                      <span>{ratio}% occupied</span>
                    </div>
                  </div>
                );
              })}
              {dashboard?.areas.length === 0 && <p className="empty-state">Create a parking area to start monitoring occupancy.</p>}
            </div>
          </section>
          <section className="card side-summary">
            <div className="section-title"><div><h3>At a glance</h3><p>System-wide activity</p></div></div>
            <div className="summary-row"><span>Completed parking sessions</span><strong>{totals?.completed_allocations ?? "—"}</strong></div>
            <div className="summary-row"><span>Total violations</span><strong>{totals?.total_violations ?? "—"}</strong></div>
            <div className="summary-row"><span>Outstanding fines</span><strong>{currency.format(Number(totals?.outstanding_fines ?? 0))}</strong></div>
            <div className="summary-note"><span className="status-dot" /> Data is read live from PostgreSQL</div>
          </section>
        </div>
      </>
    );
  }

  function renderAreas() {
    const selected = areaToEdit;
    return (
      <>
        {panelHeading("FACILITY SETUP", "Parking areas", "Create and maintain facilities, their capacity and hourly rates.")}
        {isAdmin && (
          <section className="card form-card">
            <div className="section-title">
              <div><h3>{selected ? "Edit parking area" : "Add a parking area"}</h3><p>Set the address, configured capacity and parking rate.</p></div>
              {selected && <button className="text-button" onClick={() => setAreaToEdit(null)} type="button">Cancel edit</button>}
            </div>
            <form className="data-form" onSubmit={(event) => submitForm(
              event,
              selected ? `/api/parking/areas/${selected.area_id}` : "/api/parking/areas",
              selected ? "PUT" : "POST",
            )}>
              <FormField label="Area name" name="name" defaultValue={selected?.name} />
              <FormField label="Short code" name="code" defaultValue={selected?.code} />
              <FormField label="Address" name="address" defaultValue={selected?.address} />
              <FormField label="City" name="city" defaultValue={selected?.city} />
              <FormField label="State" name="state" required={false} defaultValue={selected?.state ?? ""} />
              <FormField label="Hourly rate (₹)" name="hourlyRate" type="number" min={0} step={0.01} defaultValue={selected ? Number(selected.hourly_rate) : 30} />
              <FormField label="Configured capacity" name="totalSlots" type="number" min={1} step={1} defaultValue={selected?.total_slots ?? 10} />
              <FormField label="Description" name="description" required={false} defaultValue={selected?.description ?? ""} />
              <SelectField label="Status" name="status" defaultValue={selected?.status ?? "active"} options={["active", "inactive", "maintenance"].map((value) => ({ value, label: value }))} />
              <div className="form-actions"><button className="button primary-button" disabled={busy}>{busy ? "Saving…" : selected ? "Save changes" : "Add area"}</button></div>
            </form>
          </section>
        )}
        <section className="card table-card">
          <div className="section-title"><div><h3>All parking areas</h3><p>{areas.length} facilities registered</p></div></div>
          <div className="table-scroll"><table><thead><tr><th>Area</th><th>Location</th><th>Slots</th><th>Rate / hour</th><th>Status</th>{isAdmin && <th />}</tr></thead>
            <tbody>{areas.map((area) => <tr key={area.area_id}>
              <td><strong>{area.name}</strong><small>{area.code}</small></td>
              <td>{area.city}{area.state ? `, ${area.state}` : ""}</td>
              <td>{area.registered_slots ?? 0} <span className="muted">/ {area.total_slots} configured</span></td>
              <td>{currency.format(Number(area.hourly_rate))}</td>
              <td><span className={`badge ${area.status}`}>{area.status}</span></td>
              {isAdmin && <td><button className="text-button" onClick={() => setAreaToEdit(area)} type="button">Edit</button></td>}
            </tr>)}</tbody>
          </table></div>
        </section>
      </>
    );
  }

  function renderSlots() {
    return (
      <>
        {panelHeading("SPACE MANAGEMENT", "Parking slots", "Register spaces and keep availability current.")}
        {isAdmin && (
          <section className="card form-card">
            <div className="section-title"><div><h3>Add a parking slot</h3><p>The selected area must have remaining configured capacity.</p></div></div>
            <form className="data-form" onSubmit={(event) => submitForm(event, "/api/parking/slots", "POST")}>
              <SelectField label="Parking area" name="areaId" options={areas.map((area) => ({ value: area.area_id, label: `${area.name} (${area.code})` }))} />
              <FormField label="Slot number" name="slotNumber" placeholder="A-01" />
              <SelectField label="Slot type" name="slotType" options={["standard", "compact", "disabled", "vip", "two_wheeler"].map((value) => ({ value, label: value.replace("_", " ") }))} />
              <FormField label="Floor" name="floorNumber" type="number" min={-20} max={200} required={false} defaultValue={0} />
              <FormField label="Row" name="rowLabel" required={false} max={10} />
              <div className="form-actions"><button className="button primary-button" disabled={busy}>{busy ? "Saving…" : "Add slot"}</button></div>
            </form>
          </section>
        )}
        <section className="card table-card">
          <div className="section-title"><div><h3>Slot inventory</h3><p>{slots.length} registered spaces across all areas</p></div></div>
          <div className="table-scroll"><table><thead><tr><th>Slot</th><th>Area</th><th>Type</th><th>Floor / row</th><th>Availability</th></tr></thead>
            <tbody>{slots.map((slot) => <tr key={slot.slot_id}>
              <td><strong>{slot.slot_number}</strong></td><td>{slot.area_name}</td><td>{slot.slot_type.replace("_", " ")}</td>
              <td>{slot.floor_number ?? "—"}{slot.row_label ? ` / ${slot.row_label}` : ""}</td>
              <td>{isAdmin && !["occupied", "reserved"].includes(slot.current_status) ? (
                <select className="inline-select" value={slot.current_status} onChange={(event) => updateSlot(slot, event.target.value)}>
                  {["available", "maintenance", "blocked"].map((status) => <option key={status}>{status}</option>)}
                </select>
              ) : <span className={`badge ${slot.current_status}`}>{slot.current_status}</span>}</td>
            </tr>)}</tbody>
          </table></div>
        </section>
      </>
    );
  }

  function renderDrivers() {
    return (
      <>
        {panelHeading("PEOPLE DIRECTORY", "Drivers", "Maintain driver identity and contact records.")}
        {isAdmin && <section className="card form-card">
          <div className="section-title"><div><h3>Register a driver</h3><p>Phone numbers are stored in the normalized driver phone table.</p></div></div>
          <form className="data-form" onSubmit={(event) => submitForm(event, "/api/drivers", "POST")}>
            <FormField label="First name" name="firstName" /><FormField label="Last name" name="lastName" />
            <FormField label="Email" name="email" type="email" /><FormField label="Phone" name="phone" type="tel" />
            <FormField label="License number" name="licenseNumber" /><FormField label="City" name="city" required={false} />
            <FormField label="State" name="state" required={false} /><FormField label="Address" name="address" required={false} />
            <div className="form-actions"><button className="button primary-button" disabled={busy}>{busy ? "Saving…" : "Register driver"}</button></div>
          </form>
        </section>}
        <section className="card table-card">
          <div className="section-title"><div><h3>Registered drivers</h3><p>{drivers.length} driver records</p></div></div>
          <div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>License</th><th>Status</th></tr></thead>
            <tbody>{drivers.map((driver) => <tr key={driver.driver_id}>
              <td><strong>{driver.first_name} {driver.last_name}</strong></td><td>{driver.email}</td><td>{driver.phone}</td>
              <td>{driver.license_number}</td><td><span className={`badge ${driver.driver_status}`}>{driver.driver_status}</span></td>
            </tr>)}</tbody></table></div>
        </section>
      </>
    );
  }

  function renderVehicles() {
    return (
      <>
        {panelHeading("VEHICLE DIRECTORY", "Vehicles", "Register vehicles and associate each with its driver.")}
        {isAdmin && <section className="card form-card">
          <div className="section-title"><div><h3>Register a vehicle</h3><p>Only active driver-vehicle associations can be allocated.</p></div></div>
          <form className="data-form" onSubmit={(event) => submitForm(event, "/api/vehicles", "POST")}>
            <SelectField label="Registered driver" name="driverId" options={drivers.filter((driver) => driver.driver_status === "active").map((driver) => ({ value: driver.driver_id, label: `${driver.first_name} ${driver.last_name}` }))} />
            <FormField label="License plate" name="licensePlate" /><SelectField label="Vehicle type" name="vehicleType" options={["car", "bike", "truck", "bus", "van"].map((value) => ({ value, label: value }))} />
            <FormField label="Make" name="make" required={false} /><FormField label="Model" name="model" required={false} />
            <FormField label="Year" name="year" type="number" min={1900} max={2100} required={false} />
            <FormField label="Color" name="color" required={false} /><FormField label="Registration number" name="registrationNumber" required={false} />
            <label className="checkbox-field"><input type="checkbox" name="isPrimary" value="true" /> Set as driver’s primary vehicle</label>
            <div className="form-actions"><button className="button primary-button" disabled={busy}>{busy ? "Saving…" : "Register vehicle"}</button></div>
          </form>
        </section>}
        <section className="card table-card">
          <div className="section-title"><div><h3>Registered vehicles</h3><p>{vehicles.length} vehicle records</p></div></div>
          <div className="table-scroll"><table><thead><tr><th>License plate</th><th>Vehicle</th><th>Type</th><th>Driver</th><th>Status</th></tr></thead>
            <tbody>{vehicles.map((vehicle) => <tr key={vehicle.vehicle_id}>
              <td><strong>{vehicle.license_plate}</strong></td><td>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}</td>
              <td>{vehicle.vehicle_type}</td><td>{vehicle.driver_name ?? "Unassigned"}{vehicle.is_primary ? " · Primary" : ""}</td>
              <td><span className={`badge ${vehicle.status}`}>{vehicle.status}</span></td>
            </tr>)}</tbody></table></div>
        </section>
      </>
    );
  }

  function renderAllocations() {
    const activeDrivers = drivers.filter((driver) => driver.driver_status === "active");
    return (
      <>
        {panelHeading("PARKING SESSIONS", "Allocations", "Check vehicles in and out with slot locking and automatic fee calculation.")}
        <section className="card form-card">
          <div className="section-title"><div><h3>Check in a vehicle</h3><p>Only registered vehicles and currently available spaces are selectable.</p></div></div>
          <form className="data-form" onSubmit={(event) => submitForm(event, "/api/allocations", "POST")}>
            <SelectField label="Driver" name="driverId" onValueChange={setSelectedDriverId} options={activeDrivers.map((driver) => ({ value: driver.driver_id, label: `${driver.first_name} ${driver.last_name}` }))} />
            <SelectField label="Vehicle" name="vehicleId" options={vehicles.filter((vehicle) => vehicle.status === "active" && vehicle.driver_id && (!selectedDriverId || vehicle.driver_id === selectedDriverId)).map((vehicle) => ({ value: vehicle.vehicle_id, label: `${vehicle.license_plate} · ${vehicle.driver_name ?? "Driver"}` }))} />
            <SelectField label="Available slot" name="slotId" options={availableSlots.map((slot) => ({ value: slot.slot_id, label: `${slot.area_name} · ${slot.slot_number} (${slot.slot_type})` }))} />
            <FormField label="Expected check-out" name="expectedCheckOutTime" type="datetime-local" required={false} />
            <div className="form-actions"><button className="button primary-button" disabled={busy || availableSlots.length === 0}>{busy ? "Allocating…" : "Check in and allocate"}</button></div>
          </form>
        </section>
        <section className="card table-card">
          <div className="section-title"><div><h3>Recent allocations</h3><p>Latest 200 parking sessions</p></div></div>
          <div className="table-scroll"><table><thead><tr><th>Driver / vehicle</th><th>Area / slot</th><th>Check-in</th><th>Status</th><th>Charge</th><th /></tr></thead>
            <tbody>{allocations.map((allocation) => <tr key={allocation.allocation_id}>
              <td><strong>{allocation.driver_name}</strong><small>{allocation.license_plate}</small></td>
              <td>{allocation.area_name}<small>{allocation.slot_number}</small></td>
              <td>{prettyDate(allocation.check_in_time)}</td>
              <td><span className={`badge ${allocation.status}`}>{allocation.status.replace("_", " ")}</span></td>
              <td>{allocation.status === "checked_out" ? currency.format(Number(allocation.total_fee)) : "—"}</td>
              <td>{allocation.status === "active" && <button className="button small-button secondary-button" onClick={() => checkout(allocation)} type="button">Check out</button>}</td>
            </tr>)}</tbody>
          </table></div>
        </section>
      </>
    );
  }

  if (!user) {
    return <main className="loading-screen"><span className="loading-spinner" /> Loading secure workspace…</main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand-lockup" href="/" aria-label="Parkwise home">
          <span className="brand-mark">P</span><span><strong>Parkwise</strong><small>CONTROL CENTER</small></span>
        </Link>
        <div className="nav-section-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {tabs.map((tab) => <button
            className={`nav-link ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            key={tab.id}
            type="button"
          ><span className="nav-icon">{tab.icon}</span>{tab.label}{activeTab === tab.id && <span className="nav-marker" />}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="database-status"><span className="status-dot" /><span><strong>Database connected</strong><small>PostgreSQL · live</small></span></div>
          <div className="profile-block"><span className="avatar">{user.fullName.slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy"><strong>{user.fullName}</strong><small>{user.role.replace("_", " ")}</small></span>
            <button className="signout-button" onClick={signOut} title="Sign out" type="button">↗</button>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {tabs.find((tab) => tab.id === activeTab)?.label}</div>
          <div className="topbar-right"><span className="today-label">{new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span><span className="topbar-avatar">{user.fullName.slice(0, 1).toUpperCase()}</span></div>
        </header>
        <div className="page-content">
          {(error || message) && <div className={`notice ${error ? "error-notice" : "success-notice"}`} role={error ? "alert" : "status"}>
            <span>{error || message}</span><button onClick={() => { setError(""); setMessage(""); }} aria-label="Dismiss notification" type="button">×</button>
          </div>}
          {activeTab === "overview" && renderOverview()}
          {activeTab === "areas" && renderAreas()}
          {activeTab === "slots" && renderSlots()}
          {activeTab === "drivers" && renderDrivers()}
          {activeTab === "vehicles" && renderVehicles()}
          {activeTab === "allocations" && renderAllocations()}
          <footer className="page-footer">Smart Parking Allocation &amp; Violation Management <span>·</span> DBMS Experiential Learning</footer>
        </div>
      </main>
    </div>
  );
}
