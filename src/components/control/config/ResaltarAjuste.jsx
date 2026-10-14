import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ajustePorId, normalizarTexto } from '@/lib/configIndice'

// #410 · Lleva al ajuste elegido en la búsqueda: abre la pestaña interna que
// corresponde, desplaza hasta el bloque `data-config-anchor` y lo resalta unos
// segundos. Si el bloque todavía no existe (carga perezosa) reintenta; si no
// hay ancla en esa pantalla resalta su primer encabezado. La URL limpia el
// parámetro `ajuste` al terminar para que recargar no repita el salto.
const INTERVALO_MS = 120
const INTENTOS_MAX = 30
const RESALTADO_MS = 2600

function abrirPestana(entrada) {
  if (!entrada.tab) return true
  const pestanas = [...document.querySelectorAll('main [role="tab"]')]
  const objetivo = pestanas.find(boton => (boton.textContent || '').trim() === entrada.tab)
  if (!objetivo) return false
  if (objetivo.getAttribute('aria-selected') !== 'true') {
    objetivo.click()
    return false
  }
  return true
}

function buscarObjetivo(entrada, aceptarEncabezado) {
  const porAncla = document.querySelector(`main [data-config-anchor="${entrada.anchor}"]`)
  if (porAncla) return porAncla
  if (!aceptarEncabezado) return null
  // Sin ancla: el encabezado que nombra el ajuste, o el primero de la pantalla.
  const encabezados = [...document.querySelectorAll('main [data-testid="config-pagina"] :is(h2, h3, h4)')]
  const nombre = normalizarTexto(entrada.label)
  const propio = encabezados.find(h => {
    const texto = normalizarTexto(h.textContent)
    return texto && (texto.includes(nombre) || nombre.includes(texto))
  })
  return propio || encabezados[0] || document.querySelector('main [data-testid="config-pagina"]')
}

export default function ResaltarAjuste() {
  const { search, pathname } = useLocation()
  const navigate = useNavigate()
  const id = new URLSearchParams(search).get('ajuste')

  useEffect(() => {
    if (!id) return undefined
    const entrada = ajustePorId(id)
    const limpiar = () => {
      const params = new URLSearchParams(window.location.search)
      params.delete('ajuste')
      const resto = params.toString()
      navigate(`${pathname}${resto ? `?${resto}` : ''}`, { replace: true })
    }
    if (!entrada) {
      limpiar()
      return undefined
    }
    let intentos = 0
    const reloj = window.setInterval(() => {
      intentos += 1
      const ultimo = intentos >= INTENTOS_MAX
      const listo = abrirPestana(entrada)
      const objetivo = listo || ultimo ? buscarObjetivo(entrada, ultimo || intentos > 12) : null
      if (!objetivo && !ultimo) return
      window.clearInterval(reloj)
      if (objetivo) {
        const calmo = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        objetivo.scrollIntoView?.({ block: 'center', behavior: calmo ? 'auto' : 'smooth' })
        objetivo.setAttribute('data-config-resaltado', '')
        window.setTimeout(() => objetivo.removeAttribute('data-config-resaltado'), RESALTADO_MS)
      }
      limpiar()
    }, INTERVALO_MS)
    return () => window.clearInterval(reloj)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return null
}
