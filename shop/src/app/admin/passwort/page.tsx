import type { Metadata } from "next";

import { PasswortForm } from "@/components/admin/PasswortForm";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Passwort ändern", robots: { index: false } };

export default async function AdminPasswortPage() {
  const admin = await requireAdmin();

  return (
    <div className="max-w-lg">
      <p className="eyebrow">Konto</p>
      <h1 className="mt-2 font-display text-display-md font-extrabold">Passwort ändern</h1>
      <p className="mt-1 text-mist-700">Angemeldet als {admin.email}</p>
      <div className="card mt-6 p-6">
        <PasswortForm email={admin.email} />
      </div>
    </div>
  );
}
