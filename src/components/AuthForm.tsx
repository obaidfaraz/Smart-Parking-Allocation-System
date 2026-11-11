"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

interface AuthFormProps {
  mode: "login" | "setup";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload =
      mode === "setup"
        ? {
            fullName: formData.get("fullName"),
            email: formData.get("email"),
            password: formData.get("password"),
          }
        : {
            email: formData.get("email"),
            password: formData.get("password"),
          };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Unable to complete sign in.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("The server could not be reached. Check the application and database.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">P</div>
        <p className="eyebrow">SMART PARKING OPERATIONS</p>
        <h1>{mode === "setup" ? "Create your administrator" : "Welcome back"}</h1>
        <p className="muted">
          {mode === "setup"
            ? "This one-time setup is available only while no staff account exists."
            : "Sign in to manage parking areas, drivers and allocations."}
        </p>
        <form className="stack-form" onSubmit={submit}>
          {mode === "setup" && (
            <label>
              Full name
              <input name="fullName" autoComplete="name" minLength={2} maxLength={120} required />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="username" maxLength={150} required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={mode === "setup" ? "new-password" : "current-password"}
              minLength={mode === "setup" ? 12 : 1}
              maxLength={200}
              required
            />
            {mode === "setup" && <span className="field-hint">Use at least 12 characters.</span>}
          </label>
          {error && <p className="notice error-notice" role="alert">{error}</p>}
          <button className="button primary-button full-button" disabled={submitting}>
            {submitting
              ? "Please wait…"
              : mode === "setup"
                ? "Create administrator"
                : "Sign in"}
          </button>
        </form>
        {mode === "login" && (
          <p className="auth-footer">
            First time setting up? <Link href="/setup">Create the initial admin</Link>
          </p>
        )}
      </section>
    </main>
  );
}
