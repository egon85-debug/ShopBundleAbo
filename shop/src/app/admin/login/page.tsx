import type { Metadata } from "next";

import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export const metadata: Metadata = { title: "Backoffice-Anmeldung", robots: { index: false } };

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-carbon-950 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-display text-lg font-extrabold tracking-[.14em] text-white">WINTERFELD</p>
          <p className="font-mono text-[11px] tracking-[.2em] text-signal-300">BACKOFFICE</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white p-7 shadow-lift">
          <h1 className="font-display text-2xl font-extrabold">Anmeldung</h1>
          <p className="mt-1.5 text-sm text-mist-700">Zugang nur für berechtigte Mitarbeitende.</p>
          <AdminLoginForm />
        </div>
      </div>
    </div>
  );
}
