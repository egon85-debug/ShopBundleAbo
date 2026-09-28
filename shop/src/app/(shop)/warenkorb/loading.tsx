import { Ueberschrift } from "@/components/ui/Gestaltung";

/**
 * Sofortige Rückmeldung nach dem Klick auf „Warenkorb“.
 *
 * Die Warenkorbseite wird bei jedem Aufruf frisch aus der Datenbank gerendert.
 * Ohne diese Datei bliebe bis dahin die alte Seite stehen – der Klick wirkte,
 * als sei nichts passiert.
 */
export default function WarenkorbLaedt() {
  return (
    <div className="seite py-12 lg:py-16" aria-busy="true">
      <Ueberschrift als="h1" groesse="gross" augenbraue="Wird geladen …">Warenkorb</Ueberschrift>
      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="divide-y divide-haarlinie border-y border-haarlinie">
          {[0, 1].map((zeile) => (
            <div key={zeile} className="flex gap-5 py-6">
              <div className="h-28 w-28 shrink-0 rounded-bild bg-leinen" />
              <div className="flex-1 space-y-3 pt-2">
                <div className="h-5 w-2/3 rounded-klein bg-leinen" />
                <div className="h-4 w-1/4 rounded-klein bg-leinen" />
              </div>
            </div>
          ))}
        </div>
        <div className="karte h-64 bg-leinen/60" />
      </div>
    </div>
  );
}
