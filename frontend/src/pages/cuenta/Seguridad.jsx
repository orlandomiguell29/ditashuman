import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext';

export default function CuentaSeguridad() {
  const { usuario, actualizarUsuario } = useAuth();
  const obligatorio = usuario?.debeCambiarPass;

  // --- Cambio de contraseña ---
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errorPass, setErrorPass] = useState('');
  const [okPass, setOkPass] = useState('');
  const [guardandoPass, setGuardandoPass] = useState(false);

  async function cambiarPassword(e) {
    e.preventDefault();
    setErrorPass('');
    setOkPass('');
    if (nueva !== confirmar) {
      setErrorPass('Las contraseñas nuevas no coinciden.');
      return;
    }
    setGuardandoPass(true);
    try {
      await api.post('/auth/cambiar-password', { actual, nueva });
      setOkPass('Contraseña actualizada correctamente.');
      setActual('');
      setNueva('');
      setConfirmar('');
      actualizarUsuario({ debeCambiarPass: false });
    } catch (err) {
      setErrorPass(err.response?.data?.error || 'No fue posible cambiar la contraseña.');
    } finally {
      setGuardandoPass(false);
    }
  }

  // --- MFA (TOTP) ---
  const [mfaHabilitado, setMfaHabilitado] = useState(usuario?.mfaHabilitado || false);
  const [enrolando, setEnrolando] = useState(null); // { qrCodeDataUrl, secreto } | null
  const [codigoActivacion, setCodigoActivacion] = useState('');
  const [passwordDesactivar, setPasswordDesactivar] = useState('');
  const [errorMfa, setErrorMfa] = useState('');
  const [okMfa, setOkMfa] = useState('');
  const [cargandoMfa, setCargandoMfa] = useState(false);

  useEffect(() => {
    api.get('/auth/mfa/estado').then((res) => setMfaHabilitado(res.data.data.mfaHabilitado)).catch(() => {});
  }, []);

  async function iniciarEnrolamiento() {
    setErrorMfa('');
    setOkMfa('');
    setCargandoMfa(true);
    try {
      const { data } = await api.post('/auth/mfa/iniciar');
      setEnrolando(data);
    } catch (err) {
      setErrorMfa(err.response?.data?.error || 'No fue posible iniciar la activación de MFA.');
    } finally {
      setCargandoMfa(false);
    }
  }

  async function activarMfa(e) {
    e.preventDefault();
    setErrorMfa('');
    setCargandoMfa(true);
    try {
      await api.post('/auth/mfa/activar', { codigo: codigoActivacion });
      setMfaHabilitado(true);
      setEnrolando(null);
      setCodigoActivacion('');
      setOkMfa('Autenticación de dos factores activada. Se te pedirá el código cada vez que inicies sesión.');
    } catch (err) {
      setErrorMfa(err.response?.data?.error || 'Código incorrecto.');
    } finally {
      setCargandoMfa(false);
    }
  }

  async function desactivarMfa(e) {
    e.preventDefault();
    setErrorMfa('');
    setCargandoMfa(true);
    try {
      await api.post('/auth/mfa/desactivar', { password: passwordDesactivar });
      setMfaHabilitado(false);
      setPasswordDesactivar('');
      setOkMfa('Autenticación de dos factores desactivada.');
    } catch (err) {
      setErrorMfa(err.response?.data?.error || 'No fue posible desactivar el MFA.');
    } finally {
      setCargandoMfa(false);
    }
  }

  return (
    <div>
      <h2>Seguridad de mi cuenta</h2>

      {obligatorio && (
        <div className="alert-error" style={{ marginBottom: 20 }}>
          Por seguridad, debes cambiar tu contraseña temporal antes de continuar usando DITASH.
        </div>
      )}

      <div className="expediente-container">
        <div className="exp-section">
          <h3>Cambiar contraseña</h3>
          {errorPass && <div className="alert-error">{errorPass}</div>}
          {okPass && <div className="alert-success">{okPass}</div>}
          <form onSubmit={cambiarPassword} className="form-grid">
            <label>Contraseña actual</label>
            <input type="password" required value={actual} onChange={(e) => setActual(e.target.value)} />
            <label>Nueva contraseña</label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="Mín. 8 car., mayúscula, minúscula, número y símbolo"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
            />
            <label>Confirmar nueva contraseña</label>
            <input type="password" required value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            <button className="btn-primary" type="submit" disabled={guardandoPass} style={{ marginTop: 15 }}>
              {guardandoPass ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </form>
        </div>

        <div className="exp-section">
          <h3>Verificación en dos pasos (MFA)</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Agrega una capa extra de seguridad: además de tu contraseña, se pedirá un código de 6 dígitos generado por
            una app autenticadora (Google Authenticator, Authy, 1Password, Microsoft Authenticator, etc.).
          </p>
          {errorMfa && <div className="alert-error">{errorMfa}</div>}
          {okMfa && <div className="alert-success">{okMfa}</div>}

          {mfaHabilitado ? (
            <>
              <p><span className="tag">✔ MFA activo</span></p>
              <form onSubmit={desactivarMfa} className="form-grid" style={{ marginTop: 10 }}>
                <label>Confirma tu contraseña para desactivarlo</label>
                <input type="password" required value={passwordDesactivar} onChange={(e) => setPasswordDesactivar(e.target.value)} />
                <button className="btn-secondary" type="submit" disabled={cargandoMfa} style={{ marginTop: 10 }}>
                  {cargandoMfa ? 'Procesando…' : 'Desactivar MFA'}
                </button>
              </form>
            </>
          ) : enrolando ? (
            <form onSubmit={activarMfa} className="form-grid">
              <p>1. Escanea este código QR con tu app autenticadora:</p>
              <img src={enrolando.qrCodeDataUrl} alt="Código QR para activar MFA" style={{ width: 180, height: 180, alignSelf: 'center' }} />
              <p style={{ fontSize: 12 }}>¿No puedes escanear? Ingresa este código manualmente: <code>{enrolando.secreto}</code></p>
              <label>2. Ingresa el código de 6 dígitos que genera la app</label>
              <input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                placeholder="123456"
                value={codigoActivacion}
                onChange={(e) => setCodigoActivacion(e.target.value.replace(/\D/g, ''))}
              />
              <button className="btn-primary" type="submit" disabled={cargandoMfa || codigoActivacion.length !== 6} style={{ marginTop: 10 }}>
                {cargandoMfa ? 'Verificando…' : 'Activar MFA'}
              </button>
            </form>
          ) : (
            <button className="btn-secondary" onClick={iniciarEnrolamiento} disabled={cargandoMfa}>
              {cargandoMfa ? 'Generando…' : 'Activar verificación en dos pasos'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
