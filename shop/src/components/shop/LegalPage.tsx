import { Ueberschrift } from "@/components/ui/Gestaltung";

/**
 * Gerüst für rechtliche Seiten.
 *
 * WICHTIG: Die Inhalte sind ausdrücklich gekennzeichnete PLATZHALTER und keine
 * Rechtsberatung. Sie müssen vor Veröffentlichung durch die tatsächlichen
 * Unternehmensdaten ersetzt und rechtlich geprüft werden.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="seite py-12 lg:py-16">
      <div className="mx-auto max-w-[70ch]">
        <Ueberschrift als="h1" groesse="gross">{title}</Ueberschrift>
        {intro && <p className="mt-6 text-subheading text-kohle">{intro}</p>}

        <div className="karte-hervor mt-10 p-5">
          <p className="font-medium">Platzhalter – vor Veröffentlichung ersetzen</p>
          <p className="mt-1 text-body-sm text-kohle">
            Dieser Text ist ein Muster ohne Rechtswirkung und stellt keine Rechtsberatung dar. Er muss
            durch die tatsächlichen Angaben Ihres Unternehmens ersetzt und vor dem Livegang anwaltlich
            geprüft werden.
          </p>
        </div>

        <div className="legal-content mt-12 space-y-8 text-body text-kohle">{children}</div>
      </div>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-heading-sm font-medium text-tinte">{heading}</h2>
      <div className="mt-3 space-y-3 text-kohle">{children}</div>
    </section>
  );
}

/** Auszufüllendes Feld – im Text sofort als Lücke erkennbar. */
export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-klein bg-pfirsich px-1.5 py-0.5 text-body-sm text-tinte">
      [{children}]
    </span>
  );
}
