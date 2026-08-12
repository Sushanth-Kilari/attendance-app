"use client";

// This only fires if the root layout itself throws — kept dependency-free
// (no Tailwind classes, no shared components) since whatever broke the
// layout might have broken those too.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "24rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "8px" }}>Something went wrong</h1>
          <p style={{ color: "#666", marginBottom: "16px" }}>
            The app hit an unexpected error. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "8px 20px",
              borderRadius: "9999px",
              background: "#111",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
