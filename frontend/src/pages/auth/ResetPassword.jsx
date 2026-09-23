import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/axiosClient';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const email = params.get('email') || '';

  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (nueva !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setCargando(true);
    try {
      await api.post('/auth/reset-password', { email, token, nueva });
      setListo(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible restablecer la contraseña.');
    } finally {
      setCargando(false);
    }
  }

  if (!token || !email) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <img src="/assets/logo-mark-transparent.png" alt="DITASH Human+" className="login-logo" />
          <h2>DITASH <span>Human+</span></h2>
          <div className="alert-error">Este enlace de recuperación no es válido. Solicita uno nuevo.</div>
          <Link to="/olvide-password" className="btn-link" style={{ marginTop: 14, textAlign: 'center' }}>Solicitar enlace</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <img src="/assets/logo-mark-transparent.png" alt="DITASH Human+" className="login-logo" />
          <h2>DITASH <span>Human+</span></h2>
        <p className="subtitle">Elige tu nueva contraseña</p>

        {error && <div className="alert-error" role="alert">{error}</div>}
        {listo ? (
          <div className="alert-success">Contraseña actualizada. Ya puedes iniciar sesión con ella — redirigiendo…</div>
        ) : (
          <>
            <label htmlFor="nueva">Nueva contraseña</label>
            <input
              id="nueva"
              type="password"
              required
              minLength={8}
              autoFocus
              placeholder="Mín. 8 car., mayúscula, minúscula, número y símbolo"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
            />
            <label htmlFor="confirmar">Confirmar contraseña</label>
            <input id="confirmar" type="password" required value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            <button className="btn-primary" type="submit" disabled={cargando}>
              {cargando ? 'Guardando…' : 'Restablecer contraseña'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
