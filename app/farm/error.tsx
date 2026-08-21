"use client";

export default function FarmError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ margin: "0 auto", maxWidth: 720, padding: "64px 24px" }}>
      <p style={{ color: "#1e623d", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
        Farm operations
      </p>
      <h1 style={{ color: "#172019", fontSize: 36, letterSpacing: "-.04em", margin: "10px 0" }}>
        This operation could not be loaded
      </h1>
      <p style={{ color: "#667068", lineHeight: 1.6 }}>
        Your data was not intentionally changed. Try the page again; if the problem continues, return to the dashboard and repeat the action.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <button onClick={reset} style={{ background: "#172019", border: 0, borderRadius: 8, color: "white", cursor: "pointer", padding: "11px 15px" }} type="button">
          Try again
        </button>
        <a href="/farm" style={{ border: "1px solid #cdd5ce", borderRadius: 8, color: "#172019", padding: "10px 15px", textDecoration: "none" }}>
          Farm dashboard
        </a>
      </div>
    </main>
  );
}
