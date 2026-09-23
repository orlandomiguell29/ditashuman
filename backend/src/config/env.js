// Validación estricta de variables de entorno al arrancar la aplicación.
// Si falta o es inválida alguna variable crítica, el proceso NO debe iniciar:
// preferimos un "fail fast" en el arranque a un servidor corriendo mal configurado
// en producción (ej. sin JWT_SECRET fuerte o con CORS abierto a "*").
require('dotenv').config();
const { z } = require('zod');

// IMPORTANTE: nunca usar z.coerce.boolean() para variables de entorno.
// z.coerce.boolean() aplica el Boolean() nativo de JS, y en JS CUALQUIER
// string no vacío es "truthy" — incluida la palabra "false". Es decir,
// DB_SSL=false en el .env se leería como `true` de todas formas. Este
// helper interpreta explícitamente "true"/"1" como verdadero y
// "false"/"0"/vacío como falso.
function envBoolean(defaultValue) {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return defaultValue;
    if (typeof val === 'boolean') return val;
    return ['true', '1', 'yes', 'on'].includes(String(val).trim().toLowerCase());
  }, z.boolean());
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  // En desarrollo se permite vacío (típico en XAMPP/MySQL local sin clave
  // para "root"). En producción se exige explícitamente más abajo.
  DB_PASSWORD: z.string().default(''),
  DB_SSL: envBoolean(false),
  // Solo relevante si DB_SSL=true. Ponerlo en "false" permite conectarse a
  // servidores MySQL con certificado autofirmado (típico en Docker local o
  // algunos proveedores gestionados) sin desactivar SSL por completo.
  DB_SSL_REJECT_UNAUTHORIZED: envBoolean(true),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  MFA_ENCRYPTION_KEY: z.string().min(32),
  CSRF_SECRET: z.string().min(32),

  CORS_ORIGIN: z.string().min(1),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: envBoolean(false),
  // 'strict' por defecto (más seguro: la cookie de refresh nunca viaja en
  // navegación cross-site). Si el frontend termina desplegado en un dominio
  // distinto al de la API (subdominios separados, ej. app.ditash.com y
  // api.ditash.com cuentan como incluso el mismo dominio raíz PUEDEN seguir
  // siendo cross-site para efectos de cookies), se puede relajar a 'lax'
  // vía env var sin tocar código — antes esto estaba fijo en el código
  // (`authController.js`) con un comentario diciendo "ajustar si se
  // requiere", lo cual en la práctica significaba editar código fuente en
  // producción para un cambio de configuración de despliegue.
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(8),

  // Correo transaccional (ver utils/mailer.js). Todas opcionales: sin
  // SMTP_HOST, el sistema sigue funcionando por completo — los correos se
  // registran en el log en vez de enviarse, útil en desarrollo local sin
  // cuenta SMTP. Se sugiere Brevo (gratis, ver README §5) en producción.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // URL pública del frontend, usada para construir enlaces en correos
  // (recuperación de contraseña). Nunca se confía en el header Host de la
  // petición para esto (evita "host header injection" en los enlaces).
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Integración con Google Calendar/Meet (ver utils/googleMeet.js). Todas
  // opcionales: sin estas variables, el sistema sigue funcionando con Jitsi
  // Meet como antes — solo se activa la generación de enlaces reales de
  // Google Meet cuando un SUPER_ADMIN conecta una cuenta de Google desde
  // Admin > Integraciones.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Debe coincidir EXACTO con un "URI de redirección autorizado" configurado
  // en Google Cloud Console para este Client ID.
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:4000/api/admin/integraciones/google/callback'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Variables de entorno inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// En producción exigimos secretos fuertes y cookies seguras explícitamente.
if (parsed.data.NODE_ENV === 'production') {
  if (!parsed.data.DB_PASSWORD) {
    // eslint-disable-next-line no-console
    console.error('❌ DB_PASSWORD no puede estar vacío en producción.');
    process.exit(1);
  }
  if (!parsed.data.COOKIE_SECURE) {
    // eslint-disable-next-line no-console
    console.error('❌ COOKIE_SECURE debe ser "true" en producción (cookies solo por HTTPS).');
    process.exit(1);
  }
  if (parsed.data.CORS_ORIGIN.includes('*')) {
    // eslint-disable-next-line no-console
    console.error('❌ CORS_ORIGIN no puede ser un comodín en producción.');
    process.exit(1);
  }
}

// `SameSite=None` le dice al navegador "envía esta cookie incluso en
// peticiones cross-site" — sin `Secure`, los navegadores modernos la
// rechazan directamente (no es opcional desde 2020), y aceptarla sin HTTPS
// sería enviar el refresh token en texto plano por la red. Se valida en
// cualquier entorno, no solo producción, para que el error aparezca apenas
// se prueba esa combinación, no cuando ya esté desplegada.
if (parsed.data.COOKIE_SAMESITE === 'none' && !parsed.data.COOKIE_SECURE) {
  // eslint-disable-next-line no-console
  console.error('❌ COOKIE_SAMESITE=none requiere COOKIE_SECURE=true (los navegadores rechazan SameSite=None sin Secure).');
  process.exit(1);
}

module.exports = parsed.data;
