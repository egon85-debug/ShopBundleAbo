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
          background: "#0A1018",
          color: "#E4EBF2",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "34rem", textAlign: "center" }}>
          <p style={{ fontSize: "13px", letterSpacing: ".14em", color: "#7FA8FF", margin: 0 }}>
            WINTERFELD LOGISTIK
          </p>
          <h1 style={{ fontSize: "28px", lineHeight: 1.2, margin: "14px 0 0" }}>
            Die Seite ist gerade nicht erreichbar
          </h1>
          <p style={{ color: "#93A3B3", lineHeight: 1.6, marginTop: "12px" }}>
            Wir haben ein technisches Problem. Bitte versuchen Sie es in Kürze erneut.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "26px",
              padding: "13px 26px",
              fontSize: "15px",
              fontWeight: 700,
              color: "#FFFFFF",
              background: "#2D6FFF",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
            }}
          >
            Erneut versuchen
          </button>
          {error.digest && (
            <p style={{ marginTop: "28px", fontSize: "12px", color: "#5B6B7B", fontFamily: "monospace" }}>
              Referenz: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
