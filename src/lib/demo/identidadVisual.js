// Identidad vectorial local de Aurora; sin imágenes remotas ni datos de personas.
// Cada variante se dibuja sobre fondo transparente y usa el contraste del tema.
export function logoAurora(variant = 'light') {
  const ink = variant === 'dark' ? '#f1f5f9' : '#17212d'
  const accent = variant === 'dark' ? '#6ee7b7' : '#075e47'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="96" viewBox="0 0 360 96" role="img" aria-label="Aurora Móviles"><g fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round"><path d="M14 66h64M22 56a24 24 0 0 1 48 0M46 10v10M12 29l8 8M80 29l-8 8"/></g><g fill="${ink}" font-family="Arial,sans-serif"><text x="96" y="45" font-size="30" font-weight="700">AURORA</text><text x="97" y="72" font-size="19" letter-spacing="4">MÓVILES</text></g></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
