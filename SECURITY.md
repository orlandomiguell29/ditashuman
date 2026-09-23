# Checklist de Ciberseguridad — DITASH Human+

Referencia usada: OWASP ASVS / OWASP Top 10. Estado de cada control en esta
entrega y qué falta para llevarlo a producción.

## Autenticación y gestión de sesión

| Control | Estado | Detalle |
|---|---|---|
| Hashing de contraseñas | ✅ Implementado | Argon2id, 19 MB / t=2 (`backend/src/utils/password.js`) |
| Política de contraseñas | ✅ Implementado | 12+ caract., mayúscula, minúscula, número, símbolo (regex compartida) |
| Bloqueo por fuerza bruta | ✅ Implementado | 5 intentos fallidos → bloqueo 15 min (`authService.login`) |
| Rate limiting de login | ✅ Implementado | `express-rate-limit`, clave por IP+email |
| Tokens de acceso | ✅ Implementado | JWT de 15 min, en memoria del cliente (nunca localStorage) |
| Refresh tokens | ✅ Implementado | Rotación por uso + detección de reuso (revoca toda la familia) |
| Cookie del refresh token | ✅ Implementado | `httpOnly`, `Secure` (prod), `SameSite=Strict`, `path` acotado |
| Cierre de sesión global | ✅ Implementado | Al bloquear/desactivar un usuario o cambiar contraseña |
| MFA (2FA) TOTP | ✅ Implementado | `otplib` (RFC 6238), secreto cifrado en reposo, QR vía `qrcode`; login en dos pasos con reto de 5 min de un solo uso (`typ: 'mfa_challenge'`, `utils/jwt.js`); de autoservicio (cada usuario activa/desactiva el suyo, nadie administra el de otro); desactivar exige reconfirmar la contraseña |
| Recuperación de contraseña por correo | ✅ Implementado | Token de un solo uso (hash SHA-256, `crypto.timingSafeEqual`), expira en 30 min, respuesta idéntica exista o no la cuenta (anti-enumeración), cierra todas las sesiones activas al usarse (`authService.restablecerPassword`). Requiere SMTP configurado para enviarse de verdad; sin eso el enlace se registra en el log (ver README §5) |

## Autorización (RBAC)

| Control | Estado | Detalle |
|---|---|---|
| Permisos granulares por módulo/acción | ✅ Implementado | `requirePermission('modulo.accion')` en cada ruta mutante |
| Aislamiento multi-tenant | ✅ Implementado | `scopedToOwnCompany` + filtros `empresa_id` en cada consulta |
| Prevención de IDOR | ✅ Implementado | Ej. un colaborador solo puede ver/editar su propio expediente. Corregido en esta ronda: `responderEncuesta` no verificaba que la encuesta perteneciera a la empresa del colaborador que respondía — cualquier usuario autenticado podía responder la encuesta de otra empresa adivinando su ID. Ahora se valida `colaborador.empresa_id === encuesta.empresa_id` y se bloquea respuesta duplicada en encuestas no anónimas |
| Roles de sistema no editables | ✅ Implementado | `es_sistema=true` bloquea edición/borrado de roles base |
| Principio de menor privilegio en el seed | ✅ Implementado | Cada rol recibe solo los permisos de su función |
| Prevención de escalada de privilegios | ✅ Implementado | `usuariosController.create/update` verifica explícitamente el `rol.codigo` objetivo, no solo el permiso genérico: un `ADMIN_EMPRESA` con `usuarios.crear`/`usuarios.actualizar` no puede crear ni promover a `SUPER_ADMIN` ni crear `ESPECIALISTA` (exclusivo del panel global). Reflejado también en el frontend (el selector de roles filtra esas opciones) como UX, no como control real |
| Prevención de reasignación cross-tenant | ✅ Implementado | Solo `SUPER_ADMIN` puede cambiar el `empresa_id` de un usuario existente; antes cualquier actor con permiso de edición podía moverlo a otra empresa vía payload |
| Borrado nunca físico (solo inactivación) | ✅ Implementado | Ninguna entidad (`usuarios`, `roles`, `empresas`, `categorias`, `cursos`, `competencias`, `especialistas`, documentos del expediente) expone `DELETE`; todas usan `PATCH /:id/inactivar` y `/:id/activar` (ver README §1.2 y `utils/crudFactory.js`). Un usuario no puede auto-inactivarse |
| Nombres de permiso alineados con su efecto real | ✅ Implementado | La acción de permiso `eliminar` se renombró a `inactivar` en todo el catálogo (`config/permisos.js`, seed, rutas): el nombre ya no sugiere un borrado que el sistema nunca ejecuta |
| Comisiones del marketplace exclusivas de plataforma | ✅ Implementado | `comisionesController.exigirSuperAdmin` bloquea el pago/retención de comisiones a cualquier rol distinto de `SUPER_ADMIN`, en el controlador (defensa en profundidad) además de en el catálogo de permisos — un `ADMIN_EMPRESA` ni siquiera tiene el permiso asignado por el seed |
| Descarga de certificados sin IDOR | ✅ Implementado | `descargarCertificado` solo genera el PDF si la inscripción pertenece al colaborador autenticado; el PDF se regenera al vuelo desde la base de datos y nunca se persiste en disco, así no hay archivo estático que pueda filtrarse por una URL adivinada |

## Validación de entrada / inyección

| Control | Estado | Detalle |
|---|---|---|
| SQL Injection | ✅ Mitigado | 100% queries parametrizadas vía Sequelize ORM, cero SQL concatenado |
| Validación de esquema | ✅ Implementado | Zod con `.strict()` en cada endpoint mutante, incluidos los catálogos administrativos (empresas, categorías, cursos, competencias, tipos de evaluación) que antes aceptaban `req.body` crudo sin esquema — cerrado en esta ronda (riesgo de *mass assignment*) |
| XSS almacenado | ✅ Mitigado | React escapa por defecto; CSP restringe `script-src 'self'` |
| CSV Injection en exportaciones | ✅ Mitigado | Escapado de fórmulas (`=`, `+`, `-`, `@`) en `utils/exporter.js` |
| Subida de archivos maliciosos | ✅ Mitigado | Lista blanca MIME, tamaño máx., nombre generado por servidor, hash SHA-256 |
| HTTP Parameter Pollution | ✅ Mitigado | Middleware `hpp` |

## Transporte y cabeceras

| Control | Estado | Detalle |
|---|---|---|
| HTTPS obligatorio en prod | ⚠️ A cargo de infraestructura | La app exige `COOKIE_SECURE=true` en prod; el TLS lo termina el balanceador/proxy |
| Cabeceras de seguridad | ✅ Implementado | Helmet: CSP, `X-Content-Type-Options`, `Referrer-Policy`, etc. |
| CORS restringido | ✅ Implementado | Orígenes explícitos por env var, nunca `*` |
| CSRF | ✅ Implementado | Double-submit cookie (`csrf-csrf`) en todo verbo mutante |

## Datos sensibles

| Control | Estado | Detalle |
|---|---|---|
| Cifrado de secretos MFA en reposo | ✅ Implementado | AES-256-GCM (`utils/crypto.js`) |
| Anonimato real en encuestas | ✅ Implementado | `colaborador_id` nunca se persiste si la encuesta es anónima |
| Cifrado en tránsito a MySQL | ⚠️ Configurable | `DB_SSL=true` soportado; activar en producción |
| Backups cifrados | ❌ Pendiente | Depende del proveedor de hosting elegido |
| Retención/derecho al olvido | ⚠️ Parcial | Borrado lógico (`paranoid`) en usuarios/empresas; falta política formal de purga |

## Auditoría y observabilidad

| Control | Estado | Detalle |
|---|---|---|
| Registro de auditoría | ✅ Implementado | Tabla `auditoria`, insert-only, para login/exportaciones/cambios sensibles |
| Logging estructurado | ✅ Implementado | Winston (JSON), separado por nivel |
| No exposición de stack traces | ✅ Implementado | `errorHandler` oculta detalles internos en producción |
| Alertas de seguridad (SIEM) | ❌ Pendiente | Integrar envío de logs a un colector externo |

## Antes de salir a producción — pendientes críticos

1. Generar y custodiar los secretos (`JWT_*`, `CSRF_SECRET`,
   `MFA_ENCRYPTION_KEY`) en un gestor de secretos (no en `.env` plano).
2. Activar `DB_SSL=true` y forzar TLS en la conexión a MySQL.
3. Configurar HTTPS de extremo a extremo (certificados, HSTS) — plantilla en
   `deploy/nginx.conf.example`.
4. Configurar un proveedor SMTP real (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`)
   para que la recuperación de contraseña y las notificaciones se envíen de
   verdad, no solo se registren en el log (ver README §5).
5. Decidir si el MFA se vuelve **obligatorio** (no solo disponible) para
   `SUPER_ADMIN`/`ADMIN_EMPRESA` — hoy es de autoservicio por diseño (cada
   usuario decide activarlo); forzarlo por rol es una decisión de política
   de la organización, no solo técnica, así que se dejó como palanca
   disponible y no como comportamiento impuesto.
6. Pruebas de penetración / análisis de dependencias (`npm audit`, Snyk o
   similar) antes del primer despliegue.
7. Recorrer `deploy/CHECKLIST.md` completo (backups, firewall, monitoreo,
   supervisión de proceso) antes de anunciar el sistema a usuarios reales.
