"use client";

/**
 * Último resorte: solo se activa si el error rompe el layout raíz (algo que
 * "app/error.tsx" no puede atajar porque ni siquiera llegó a montarse el
 * layout). Reemplaza <html>/<body> enteros, así que va con estilos inline,
 * sin depender de globals.css ni de las fuentes por si el problema es ahí.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es-AR">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#E9EDF2", color: "#0D182B" }}>
        <main
          style={{
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 360 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 8px" }}>Algo salió mal</h1>
            <p style={{ color: "#424F64", margin: "0 0 20px" }}>
              Hubo un problema inesperado. Probá de nuevo en un momento.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#1F5FAF",
                color: "#fff",
                border: "none",
                borderRadius: 7,
                padding: "12px 22px",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
