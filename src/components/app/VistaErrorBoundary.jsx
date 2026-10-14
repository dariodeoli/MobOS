import { Component } from 'react'

// Una vista lazy puede fallar al descargar su código (p. ej. se cortó la red a
// mitad de carga). Sin un límite de error React desmonta toda la app y el shell
// (cabecera, avatar, aviso de conexión) desaparece. Este límite deja el shell en
// pie y muestra un aviso con reintento solo en el área de la vista.
export default class VistaErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(anterior) {
    // Al cambiar de vista se vuelve a intentar sin desmontar las vistas vivas.
    if (this.state.error && anterior.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  componentDidCatch(error) {
    console.error('[vista] no se pudo cargar la pantalla:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false
    return (
      <div role="alert" data-testid="vista-error" className="rounded-lg border border-ink-600 bg-ink-800 p-4 text-sm text-fore">
        <p className="font-medium">
          {sinRed ? 'Esta pantalla no terminó de cargar porque no hay conexión.' : 'No se pudo cargar esta pantalla.'}
        </p>
        <p className="mt-1 text-mute">Se vuelve a intentar al recargar. Lo ya cargado sigue disponible.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 min-h-11 rounded-lg border border-ink-600 px-4 hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"
        >
          Reintentar
        </button>
      </div>
    )
  }
}
