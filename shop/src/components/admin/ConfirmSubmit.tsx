"use client";

import type { ReactNode } from "react";

/** Absende-Knopf mit Rückfrage – für Aktionen, die sich nicht rückgängig machen lassen. */
export function ConfirmSubmit({
  frage,
  className,
  children,
}: {
  frage: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(frage)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
