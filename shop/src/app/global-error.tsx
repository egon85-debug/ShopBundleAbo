"use client";

/**
 * Letztes Auffangnetz, falls schon das Wurzel-Layout scheitert. Diese Seite
 * bringt ihr eigenes <html>/<body> mit und kommt ohne Stylesheet aus, damit sie
 * auch dann rendert, wenn sonst nichts mehr funktioniert.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          color: "#0a0a0a",
          fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "34rem", textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: "#7a7b7b", margin: 0 }}>Winterfeldt Logistik</p>
          <h1 style={{ fontSize: "32px", lineHeight: 1.22, fontWeight: 300, letterSpacing: "-0.02em", margin: "16px 0 0" }}>
            Die Seite ist gerade nicht erreichbar
          </h1>
          <p style={{ color: "#292b2a", lineHeight: 1.56, marginTop: "16px" }}>
            Wir haben ein technisches Problem. Bitte versuchen Sie es in Kürze erneut.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "32px",
              padding: "16px 32px",
              fontSize: "16px",
              fontWeight: 500,
              color: "#ffffff",
              background: "#ff6105",
              border: "none",
              borderRadius: "50px",
              boxShadow: "rgba(255, 97, 5, 0.6) 1px 6px 14px 0px, rgba(0, 0, 0, 0.06) 0px 1px 4px 0px",
              cursor: "pointer",
            }}
          >
            Erneut versuchen
          </button>
          {error.digest && (
            <p style={{ marginTop: "32px", fontSize: "12px", color: "#7a7b7b" }}>
              Referenz: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
