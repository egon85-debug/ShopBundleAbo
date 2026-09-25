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
    <div className="seite py-16 lg:py-20">
      <div className="karte mx-auto max-w-md p-8">
        <h1 className="text-heading-sm font-medium">Neues Passwort festlegen</h1>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="mt-4 text-kohle">
            Dieser Link ist unvollständig. Fordern Sie unter „Konto → Passwort“ einen neuen Link an.
          </p>
        )}
      </div>
    </div>
  );
}
