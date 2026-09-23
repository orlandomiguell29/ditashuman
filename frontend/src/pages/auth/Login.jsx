import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const { usuario, login, completarMfa } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  // Paso 2 (solo si la cuenta tiene MFA habilitado): el backend ya validó
  // email+contraseña y devolvió un reto de 5 minutos; falta el código de la
  // app autenticadora para completar el inicio de sesión.
  const [mfaChallengeToken, setMfaChallengeToken] = useState(null);
  const [codigoMfa, setCodigoMfa] = useState('');

  if (usuario) return <Navigate to={location.state?.from || '/'} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const resultado = await login(email, password);
      if (resultado.mfaRequerido) setMfaChallengeToken(resultado.mfaChallengeToken);
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible iniciar sesión.');
    } finally {
      setCargando(false);
    }
  }

  async function onSubmitMfa(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await completarMfa(mfaChallengeToken, codigoMfa);
    } catch (err) {
      setError(err.response?.data?.error || 'Código incorrecto.');
    } finally {
      setCargando(false);
    }
  }

  if (mfaChallengeToken) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={onSubmitMfa}>
          <img src="/assets/logo-mark-transparent.png" alt="DITASH Human+" className="login-logo" />
          <h2>DITASH <span>Human+</span></h2>
          <p className="subtitle">Verificación en dos pasos</p>
          {error && <div className="alert-error" role="alert">{error}</div>}
          <label htmlFor="codigo">Código de tu app autenticadora</label>
          <input
            id="codigo"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            placeholder="123456"
            value={codigoMfa}
            onChange={(e) => setCodigoMfa(e.target.value.replace(/\D/g, ''))}
          />
          <button className="btn-primary" type="submit" disabled={cargando || codigoMfa.length !== 6}>
            {cargando ? 'Verificando…' : 'Verificar e ingresar'}
          </button>
          <button type="button" className="btn-link" style={{ marginTop: 10 }} onClick={() => setMfaChallengeToken(null)}>
            ← Volver
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit} autoComplete="on">
        <img src="/assets/logo-mark-transparent.png" alt="DITASH Human+" className="login-logo" />
        <h2>DITASH <span>Human+</span></h2>
        <p className="subtitle">Ingresa con tu cuenta corporativa</p>

        {error && <div className="alert-error" role="alert">{error}</div>}

        <label htmlFor="email">Correo electrónico</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="btn-primary" type="submit" disabled={cargando}>
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </button>

        <Link to="/olvide-password" className="btn-link" style={{ marginTop: 14, textAlign: 'center' }}>
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </div>
  );
}
