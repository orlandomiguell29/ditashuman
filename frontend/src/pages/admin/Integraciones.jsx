import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';

// Conectar Google es un flujo con redirección de página completa a Google
// (accounts.google.com) y vuelta al backend, no una llamada XHR: el backend
// entrega la URL de consentimiento y este componente simplemente navega a
// ella. Al volver, se recarga el estado para reflejar la conexión.
export default function AdminIntegraciones() {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState('');
  const [conectando, setConectando] = useState(false);

  function cargar() {
    api
      .get('/admin/integraciones/google/estado')
      .then((res) => setEstado(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'No fue posible consultar el estado de la integración.'));
  }
  useEffect(cargar, []);

  async function conectar() {
    setConectando(true);
    setError('');
    try {
      const { data } = await api.get('/admin/integraciones/google/conectar');
      window.location.href = data.data.url;
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible iniciar la conexión con Google.');
      setConectando(false);
    }
  }

  async function desconectar() {
    if (!window.confirm('¿Desconectar la cuenta de Google? Las nuevas citas con canal "Google Meet" volverán a usar Jitsi hasta que se conecte de nuevo.')) return;
    setError('');
    try {
      await api.post('/admin/integraciones/google/desconectar');
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible desconectar la cuenta.');
    }
  }

  return (
    <div>
      <h2>Integraciones</h2>
      {error && <div className="alert-error">{error}</div>}
      {!estado && !error && <p>Cargando…</p>}

      {estado && (
        <div className="exp-section" style={{ maxWidth: 640 }}>
          <h3>Google Calendar / Meet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Con esta cuenta conectada, DITASH puede crear reuniones reales de Google Meet al agendar citas (canal
            "Google Meet"). Sin conexión, las citas siguen funcionando con Jitsi Meet como hasta ahora.
          </p>

          {!estado.credencialesConfiguradas && (
            <div className="alert-error" style={{ marginTop: 12 }}>
              El backend todavía no tiene <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> configurados
              en su <code>.env</code>. Revisa el README (sección "Google Meet") para crearlos en Google Cloud Console y
              agrégalos antes de conectar.
            </div>
          )}

          {estado.credencialesConfiguradas && estado.erroresFormatoCredenciales?.length > 0 && (
            <div className="alert-error" style={{ marginTop: 12 }}>
              <strong>Las credenciales configuradas no parecen válidas:</strong>
              <ul style={{ margin: '6px 0 0 18px' }}>
                {estado.erroresFormatoCredenciales.map((msg, i) => (
                  <li key={i} style={{ marginTop: 4 }}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {estado.credencialesConfiguradas && estado.conectado && (
            <div style={{ marginTop: 12 }}>
              <p>
                <span className="tag">✔ Conectado</span> como <strong>{estado.cuentaEmail}</strong>
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Conectado el {new Date(estado.conectadoEn).toLocaleString('es-CO')}
              </p>
              <button className="btn-secondary btn-danger" type="button" onClick={desconectar}>Desconectar</button>
            </div>
          )}

          {estado.credencialesConfiguradas && !estado.conectado && !estado.erroresFormatoCredenciales?.length && (
            <div style={{ marginTop: 12 }}>
              <button className="btn-primary" type="button" disabled={conectando} onClick={conectar}>
                {conectando ? 'Redirigiendo…' : 'Conectar cuenta de Google'}
              </button>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                Se abrirá la pantalla de consentimiento de Google. Usa la cuenta de Google/Workspace que quieras que
                cree las reuniones (por ejemplo, la de RRHH).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
