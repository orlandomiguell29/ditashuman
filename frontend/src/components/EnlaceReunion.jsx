// Muestra el enlace de videollamada de una cita como un botón, no como
// texto azul subrayado — y distingue Google Meet de Jitsi por la URL para
// que se vea con su propia marca (color e ícono), ya que ambos canales
// generan enlaces reales según cuál esté conectado (ver
// backend/src/utils/googleMeet.js y videollamada.js).
export default function EnlaceReunion({ url }) {
  if (!url) return null;

  const esMeet = url.includes('meet.google.com');
  const esJitsi = url.includes('meet.jit.si');

  const estilo = esMeet
    ? { background: '#00897b', label: 'Entrar a Google Meet' }
    : esJitsi
      ? { background: '#1d4ed8', label: 'Entrar a la videollamada' }
      : { background: 'var(--dark)', label: 'Entrar a la videollamada' };

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="btn-reunion"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: estilo.background,
        color: '#fff',
        padding: '6px 12px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      {esMeet && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.5 12.5l-3-2v3l-4-3.5 4-3.5v3l3-2v5z" />
        </svg>
      )}
      {!esMeet && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
        </svg>
      )}
      {estilo.label}
    </a>
  );
}
