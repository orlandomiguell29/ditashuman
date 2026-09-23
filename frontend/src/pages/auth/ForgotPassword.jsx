import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axiosClient';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      // El backend responde igual exista o no la cuenta (mitiga
      // enumeración de usuarios), así que este mensaje es siempre el mismo.
      await api.post('/auth/forgot-password', { email });
      setEnviado(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible procesar la solicitud.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <img src="/assets/logo-mark-transparent.png" alt="DITASH Human+" className="login-logo" />
          <h2>DITASH <span>Human+</span></h2>
        <p className="subtitle">Recuperar contraseña</p>

        {error && <div className="alert-error" role="alert">{error}</div>}
        {enviado ? (
          <div className="alert-success">Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada (y spam).</div>
        ) : (
          <>
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn-primary" type="submit" disabled={cargando}>
              {cargando ? 'Enviando…' : 'Enviar enlace de recuperación'}
            </button>
          </>
        )}

        <Link to="/login" className="btn-link" style={{ marginTop: 14, textAlign: 'center' }}>← Volver al inicio de sesión</Link>
      </form>
    </div>
  );
}
