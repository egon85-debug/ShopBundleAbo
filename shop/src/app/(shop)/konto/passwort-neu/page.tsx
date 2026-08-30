import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/shop/ResetPasswordForm";

export const metadata: Metadata = { title: "Neues Passwort", robots: { index: false } };

export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="section py-16">
      <div className="card mx-auto max-w-md p-7">
        <h1 className="font-display text-2xl font-extrabold">Neues Passwort festlegen</h1>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="mt-4 text-mist-700">
            Dieser Link ist unvollständig. Fordern Sie unter „Konto → Passwort“ einen neuen Link an.
          </p>
        )}
      </div>
    </div>
  );
}
