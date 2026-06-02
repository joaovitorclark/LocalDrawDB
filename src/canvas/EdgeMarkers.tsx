// Definições de marcadores SVG para a notação pé-de-galinha (crow's foot).
// Referenciados por url(#id) nas arestas. Ids globais ao documento.
export function EdgeMarkers() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
      <defs>
        {/* muitos (*) — pé-de-galinha */}
        <marker
          id="cf-many"
          markerWidth="22"
          markerHeight="22"
          refX="20"
          refY="11"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M20,11 L6,4 M20,11 L4,11 M20,11 L6,18"
            stroke="var(--brand-navy, #13284b)"
            strokeWidth="1.5"
            fill="none"
          />
        </marker>
        {/* um (1) — barra única */}
        <marker
          id="cf-one"
          markerWidth="22"
          markerHeight="22"
          refX="14"
          refY="11"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M14,4 L14,18"
            stroke="var(--brand-navy, #13284b)"
            strokeWidth="1.5"
            fill="none"
          />
        </marker>
      </defs>
    </svg>
  );
}
