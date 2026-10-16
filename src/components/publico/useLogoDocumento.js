import { useEffect, useState } from 'react'
import { API_URL } from '@/lib/api/client'
import { varianteDeTema } from '@/lib/tenantLogo'

// La imagen se autoriza con el mismo documento, nunca con un tenant del cliente.
export function useLogoDocumento({ ruta, token, disponible, demo = false }) {
  const [variante, setVariante] = useState(varianteDeTema)
  useEffect(() => {
    const observer = new MutationObserver(() => setVariante(varianteDeTema()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  const base = disponible && !demo ? `${API_URL}${ruta}/${encodeURIComponent(token || '')}/logo` : ''
  return { logo: base ? `${base}?variant=${variante}` : '', logoClaro: base ? `${base}?variant=light` : '' }
}
