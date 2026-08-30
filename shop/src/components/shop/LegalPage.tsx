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
    <div className="section py-12">
      <div className="mx-auto max-w-[70ch]">
        <h1 className="font-display text-display-lg font-extrabold">{title}</h1>
        {intro && <p className="mt-4 text-lg text-mist-700">{intro}</p>}

        <div className="mt-8 rounded-2xl border-l-4 border-beacon-500 bg-beacon-400/10 p-5">
          <p className="font-display font-bold">Platzhalter – vor Veröffentlichung ersetzen</p>
          <p className="mt-1 text-[15px] text-mist-700">
            Dieser Text ist ein Muster ohne Rechtswirkung und stellt keine Rechtsberatung dar. Er muss
            durch die tatsächlichen Angaben Ihres Unternehmens ersetzt und vor dem Livegang anwaltlich
            geprüft werden.
          </p>
        </div>

        <div className="legal-content mt-10 space-y-6 text-[16px] leading-relaxed text-carbon-800">
          {children}
        </div>
      </div>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold text-carbon-900">{heading}</h2>
      <div className="mt-2 space-y-3 text-mist-700">{children}</div>
    </section>
  );
}

/** Auszufüllendes Feld – im Text sofort als Lücke erkennbar. */
export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-beacon-400/25 px-1.5 py-0.5 font-mono text-[14px] text-carbon-900">
      [{children}]
    </span>
  );
}
