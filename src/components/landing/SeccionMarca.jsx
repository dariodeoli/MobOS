// Marca de sección de la landing editorial: número de capítulo + etiqueta, con
// una regla fina entre ambos. Es el ritmo que ordena la página de 01 a 10.
export default function SeccionMarca({ numero, etiqueta, className = '' }) {
  return (
    <p className={`landing-eyebrow landing-marca ${className}`.trim()}>
      <span className="landing-marca-num">{numero}</span>
      <span className="landing-marca-rule" aria-hidden="true" />
      <span>{etiqueta}</span>
    </p>
  )
}
