import { Component } from 'react';

// Sin un ErrorBoundary, CUALQUIER excepción no controlada durante el render
// de una página (ej. leer una propiedad de un dato que llegó undefined del
// backend) tumba todo el árbol de React y deja al usuario con una pantalla
// en blanco total — sin sidebar, sin menú, sin forma de volver atrás salvo
// recargar. Desde afuera eso se siente como "se salió del sistema".
//
// Este componente atrapa esos errores SOLO dentro de la sección que envuelve
// (normalmente el <Outlet/> del layout), así el resto de la app (header,
// sidebar, sesión) sigue intacto y el usuario puede navegar a otra página
// para salir del error sin perder la sesión ni recargar todo.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Error no controlado en una página:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Si el usuario navega a otra ruta después de un error, se limpia el
    // estado automáticamente: no hace falta recargar la página para "salir"
    // del error, basta con ir a otra sección del menú.
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="alert-error" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Algo salió mal al mostrar esta página.</h3>
          <p>No perdiste tu sesión ni tus datos. Intenta de nuevo o ve a otra sección desde el menú.</p>
          <button className="btn-secondary" type="button" onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
