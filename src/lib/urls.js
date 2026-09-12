const isNewDomain = typeof window !== 'undefined' && window.location.hostname.endsWith('moboss.online')

export const publicUrls = {
  landing: isNewDomain ? 'https://moboss.online' : 'https://controlaria.online',
  app: isNewDomain ? 'https://app.moboss.online' : 'https://app.controlaria.online',
}
