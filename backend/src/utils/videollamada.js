const crypto = require('crypto');

// Genera una sala REAL de videollamada en Jitsi Meet (meet.jit.si), el
// servidor público y gratuito sugerido en el README para no depender de
// licencias de Zoom/Teams. No requiere API key: cualquier URL con un
// nombre de sala único crea la sala la primera vez que alguien entra.
// El nombre de sala es aleatorio e impredecible (no el ID de la cita ni
// nada derivable) para que nadie pueda "adivinar" o entrar a la sala de
// otra cita — Jitsi no tiene control de acceso propio en el plan gratuito,
// así que la imprevisibilidad del nombre ES el control de acceso.
function generarEnlaceReunion() {
  const sala = `DITASH-${crypto.randomBytes(12).toString('hex')}`;
  return `https://meet.jit.si/${sala}`;
}

module.exports = { generarEnlaceReunion };
