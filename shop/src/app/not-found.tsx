import Link from "next/link";

import ShopLayout from "@/app/(shop)/layout";
import { Ueberschrift } from "@/components/ui/Gestaltung";

/** Seite für unbekannte Adressen und entfernte Produkte – im Shop-Rahmen. */
export default function NichtGefunden() {
  return (
    <ShopLayout>
      <div className="seite py-20 lg:py-28">
        <div className="mx-auto max-w-xl text-center">
          <Ueberschrift als="h1" groesse="gross" mitte augenbraue="Fehler 404">
            Diese Seite gibt es nicht
          </Ueberschrift>
          <p className="mt-6 text-kohle">
            Vielleicht ist der Artikel nicht mehr im Sortiment oder der Link hat sich geändert.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/shop" className="knopf-aktion">
              Zum Shop <span aria-hidden>→</span>
            </Link>
            <Link href="/" className="knopf-zweit">
              Zur Startseite
            </Link>
          </div>
        </div>
      </div>
    </ShopLayout>
  );
}
