"use client";

import { useEffect } from "react";

/**
 * Shown when the root layout itself fails, so none of the app's providers (language, theme) exist. It therefore
 * uses plain HTML and inline styles, and says the same thing in English and Arabic.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0b0f14",
          color: "#f2f5f7",
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong / حدث خطأ ما</h1>
        <p style={{ margin: 0, maxWidth: 420, opacity: 0.75, fontSize: 14 }}>
          The app could not load. Please try again. / تعذّر تحميل التطبيق. يرجى المحاولة مرة أخرى.
        </p>
        {error.digest && (
          <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, opacity: 0.6 }}>{error.digest}</p>
        )}
        <button
          onClick={reset}
          style={{ padding: "8px 16px", borderRadius: 8, border: 0, cursor: "pointer", fontSize: 14 }}
        >
          Retry / إعادة المحاولة
        </button>
      </body>
    </html>
  );
}
