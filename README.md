# DITASH Human+ — Plataforma de Bienestar Corporativo

Reimplementación full-stack (Node.js + Express + MySQL + React) del prototipo
estático entregado, con autenticación real, control de acceso basado en
roles y permisos granulares (RBAC), y las prácticas de ciberseguridad que el
prototipo (por ser un mockup de solo-frontend) no podía tener.

## 1. Qué se recibió y qué se construyó

El prototipo original (`ditash-prototype.zip`) era una SPA de un solo archivo
HTML con JavaScript vanilla y datos "mockeados" en memoria (`js/mockData.js`).
No existía backend, base de datos, autenticación ni control de acceso: un
botón en la parte superior permitía cambiar de "rol" libremente sin ningún
tipo de validación. Se identificaron 3 vistas/roles:

1. **Colaborador** (empleado): inicio, categorías de bienestar, agendamiento
   de citas con especialistas (con copago empresa/colaborador), academia
   virtual de cursos, y expediente digital (CV, certificados, OKRs,
   historial de asesorías).
2. **Empresa (RRHH/SST)**: dashboard de indicadores, módulo de evaluación de
   desempeño (90/180/270/360°, diccionario de competencias, Plan Individual
   de Desarrollo automático) y encuestas de clima organizacional.
3. **Especialista** (marketplace de profesionales): agenda/horarios de
   atención y reporte de honorarios con comisión del 15%.

Este repositorio entrega una base productiva real de ese sistema:

- **Base de datos MySQL** normalizada (`backend/db/schema.sql`) con 25+
  tablas: usuarios, roles, permisos, empresas, colaboradores, especialistas,
  citas, comisiones, cursos, evaluaciones, encuestas de clima, expedientes,
  auditoría, refresh tokens, etc.
- **API REST en Node.js/Express** con autenticación JWT (access + refresh),
  RBAC granular por módulo/acción, multi-tenant (aislamiento por empresa),
  validación estricta con Zod, exportación a CSV/Excel, subida seguridad de
  archivos, rate limiting, CSRF, cabeceras de seguridad (Helmet/CSP) y
  auditoría de acciones sensibles.
- **Frontend en React (Vite)** que reproduce fielmente las 3 vistas del
  prototipo, consumiendo la API real, con rutas protegidas por rol/permiso,
  y un **módulo de administración completo (CRUD + exportar)** de Usuarios,
  Roles y Permisos, Empresas, Categorías de bienestar, Cursos, Competencias
  y Especialistas del marketplace — la pieza que el prototipo declaraba
  explícitamente que no tenía.

### 1.1. Tercera ronda: matriz de permisos, módulos completos y responsive

El usuario reportó, tras revisar la segunda entrega, tres problemas concretos
que esta ronda cierra:

**a) La gestión de permisos no era clara.** El editor de roles mostraba los
70 permisos (14 módulos × 5 acciones) como una lista plana de checkboxes
apilados dentro de un modal angosto — difícil de leer y de auditar de un
vistazo. Se reemplazó por una **matriz módulo × acción** (`Roles.jsx`), en
un panel de ancho completo con scroll propio: cada fila es un módulo, cada
columna una acción, con "seleccionar todo" por fila y por columna y un
buscador de módulos. Los datos básicos del rol (nombre, descripción) se
editan aparte de sus permisos, en vez de mezclarse en el mismo formulario.
De paso se corrigió la acción de permiso `eliminar`, que en realidad nunca
borraba nada (el sistema solo inactiva): se renombró a `inactivar` en todo
el backend y el frontend para que el nombre del permiso describa lo que
realmente autoriza.

**b) Módulos de negocio incompletos.** Una auditoría dedicada encontró que
varias pantallas mostraban datos reales pero no ofrecían las acciones que
el negocio necesita. Se completaron:
- **Citas**: selector de horario real contra la disponibilidad del
  especialista (antes se agendaba siempre "mañana 10 a.m." fijo);
  cancelación desde colaborador y especialista; confirmación de cita por
  el especialista; eliminar franja horaria ya tenía endpoint pero le
  faltaba el botón.
- **Academia virtual**: progreso del curso (antes quedaba fijo en 0%),
  marca de "completado" y emisión de una referencia de certificado.
- **Expediente digital**: descarga controlada de documentos (revalida
  permisos en cada acceso) e inactivación de documentos mal subidos —
  ninguna de las dos existía.
- **Evaluaciones de desempeño**: formulario para crear evaluaciones desde
  la UI (el backend ya lo soportaba, pero no había forma de usarlo) y
  seguimiento del Plan Individual de Desarrollo (sugerido → en progreso →
  completado), que antes solo se mostraba como texto sin poder avanzarlo.
- **Clima organizacional**: formulario para crear encuestas, cierre de
  encuesta y **resultados agregados por pregunta** (promedio en escalas,
  conteo sí/no, respuestas de texto libre) — antes RRHH solo podía listar
  encuestas, sin crear, cerrar ni ver resultados. Se agregó también la
  pantalla del colaborador para responder encuestas activas de su empresa
  (el endpoint existía en el backend pero no tenía ninguna pantalla que lo
  consumiera), y se corrigió una brecha de seguridad real: cualquier
  colaborador autenticado podía responder la encuesta de **otra** empresa
  adivinando su ID (IDOR), sin verificación de pertenencia.

**c) El diseño no era responsive.** Por debajo de 900px el menú lateral
simplemente desaparecía (`display: none`) sin ninguna forma de volver a
abrirlo, dejando la aplicación inutilizable en tablet o celular. Se
reemplazó por un menú lateral **off-canvas** con botón hamburguesa
(`DashboardLayout.jsx`), y se revisó el CSS completo (`global.css`) con
breakpoints en 1024px, 900px y 560px: tablas con scroll horizontal propio,
modales a pantalla completa en celular, barras de herramientas y formularios
que se apilan en vertical, y grids que colapsan a una columna.

### 1.2. Patrón de borrado: inactivar, nunca eliminar

Ninguna entidad de negocio se borra físicamente desde la API. Usuarios,
roles, empresas, categorías, cursos, competencias y especialistas se
**inactivan** (`PATCH /:id/inactivar`) y se **reactivan**
(`PATCH /:id/activar`) en vez de con un `DELETE`. Esto preserva el
historial (citas, comisiones, evaluaciones ya realizadas) y la integridad
referencial, evita borrados accidentales irreversibles y cumple con
obligaciones típicas de conservación de datos laborales/SST. Un listado
oculta por defecto los registros inactivos; `?incluirInactivos=true`
los muestra para poder reactivarlos. Justificación completa del diseño en
los comentarios de `backend/src/utils/crudFactory.js`.

Al crear un usuario con rol `COLABORADOR` o `ESPECIALISTA` desde el panel de
administración, el sistema crea automáticamente (en una misma transacción)
el perfil vinculado (`Colaborador` o `Especialista`) para que el dashboard
correspondiente funcione desde el primer login — un especialista creado así
queda `verificado=false` hasta que un administrador lo verifique
explícitamente desde "Especialistas".

### 1.3. Cuarta ronda: comisiones, MFA, correo real, videollamadas reales y certificados en PDF

El usuario pidió cerrar explícitamente la lista de pendientes que había
quedado documentada en `SECURITY.md`, y quitar el botón de exportar CSV de
toda la interfaz (Excel cubre el mismo caso de uso). Esta ronda entrega:

- **Botón de exportar CSV eliminado** de las 10 pantallas que lo tenían
  (`ExportButtons.jsx`, componente compartido). El backend conserva
  `?format=csv` en cada endpoint de exportación por si se necesita en el
  futuro o para integraciones — solo se retiró el botón de la UI.
- **Comisiones del marketplace**: pantalla exclusiva de `SUPER_ADMIN`
  (`/admin/comisiones`) para marcar una comisión como `pagada`, `retenida`
  (disputa) o liberar la retención, con exportación. Se mantiene fuera del
  alcance de `ADMIN_EMPRESA` a propósito: el pago a especialistas es un
  asunto de la plataforma, no de una empresa cliente individual (validado
  también en el controlador, no solo con el permiso).
- **Videollamadas reales**: al agendar una cita por "videollamada interna" se
  genera una sala real de [Jitsi Meet](https://meet.jit.si) con un nombre
  aleatorio de 24 caracteres (`crypto.randomBytes`) como único control de
  acceso — gratuito, sin API key. El enlace se muestra en la agenda del
  colaborador y del especialista, y se envía también por correo.
- **Correo transaccional real** vía SMTP (Nodemailer, cualquier proveedor
  estándar — Brevo, Gmail, SES): bienvenida con contraseña temporal,
  contraseña temporal regenerada por un admin, cita agendada (con el enlace
  de videollamada) y recuperación de contraseña. Si no hay `SMTP_HOST`
  configurado, el sistema sigue funcionando igual: el contenido del correo
  se registra en el log del servidor en vez de enviarse, para que el
  desarrollo local no dependa de una cuenta SMTP real.
- **Recuperación de contraseña de autoservicio**: `/olvide-password` →
  correo con enlace de un solo uso (hash SHA-256, expira en 30 minutos,
  comparación en tiempo constante) → `/restablecer-password`. No confirma ni
  niega si el correo existe (mitiga enumeración de usuarios).
- **MFA (verificación en dos pasos) real con TOTP**: cualquier usuario puede
  activarla desde "Mi cuenta" (QR compatible con Google Authenticator, Authy,
  1Password, etc.). El secreto se cifra en reposo (AES-256-GCM, ya existente).
  El login pasa a dos pasos cuando está activa: `POST /auth/login` devuelve
  un reto de 5 minutos en vez de una sesión, y `POST /auth/login/mfa` la
  completa con el código de 6 dígitos. Desactivarla exige volver a confirmar
  la contraseña (defensa ante una sesión secuestrada). Es de autoservicio,
  no obligatoria por rol: cada usuario decide si la activa, y nadie —ni
  `SUPER_ADMIN`— administra el MFA de otra cuenta.
- **Certificados de curso en PDF real**: al completar un curso con
  `otorga_certificado`, el colaborador puede descargar un PDF generado al
  vuelo (`pdfkit`, sin dependencias externas) con su nombre, el curso, la
  duración, la fecha y un código de verificación. No se guarda ningún
  archivo en disco: se regenera en cada descarga a partir de los datos ya
  persistidos, así el documento siempre refleja el estado real y no hay
  archivos de certificados que proteger o filtrar por error.
- **Pantalla "Mi cuenta"** (`/cuenta/seguridad`, disponible para los 4 roles):
  cambio de contraseña propia y gestión de MFA. Si la cuenta tiene una
  contraseña temporal pendiente de cambio (`debe_cambiar_pass`), el sistema
  redirige aquí automáticamente y bloquea el resto de la aplicación hasta
  que se cambie.

## 2. Lo que este entregable NO es

Es una **base sólida de nivel profesional**, no un producto terminado. Un
sistema de este alcance (multi-tenant, con datos de salud, pagos y
cumplimiento SST) normalmente toma varias semanas de un equipo. Sigue
pendiente, honestamente:

- **Pasarela de pagos/facturación real** hacia el especialista (transferencia
  bancaria, PSE, etc.). Lo que sí existe es la transición de estado completa
  de la comisión (`pendiente → pagado/retenido`, sección 1.3) — falta
  conectarla a un proveedor de pagos real, que requiere credenciales y
  cuenta comercial propias del cliente.
- **Tests automatizados exhaustivos** (se dejó la estructura en
  `backend/tests`; no hay cobertura completa de unit/integration/e2e).
- **Infraestructura de producción gestionada**: pipeline de CI/CD, WAF,
  backups automatizados, rotación de secretos vía KMS/Vault, monitoreo/SIEM.
  Sección 8 entrega plantillas de arranque (Nginx + TLS, Docker Compose de
  producción, PM2/systemd, checklist de despliegue) pero requieren el
  dominio, certificado y proveedor de hosting que solo el cliente puede
  decidir.

## 3. Arquitectura

```
ditash-app/
├── backend/                  # API REST (Node.js + Express + Sequelize)
│   ├── db/schema.sql          # DDL completo de MySQL
│   ├── db/seed.js             # Roles, permisos y datos demo
│   └── src/
│       ├── config/            # env.js (validación), database.js, permisos.js
│       ├── models/            # Modelos Sequelize + asociaciones
│       ├── middlewares/       # auth, rbac, validate, rateLimit, upload, audit
│       ├── controllers/       # Lógica de cada módulo
│       ├── services/          # authService (login, refresh, rotación tokens)
│       └── routes/            # Definición de endpoints
├── frontend/                  # SPA (React + Vite)
│   └── src/
│       ├── api/axiosClient.js # Access token en memoria + refresh automático
│       ├── context/AuthContext.jsx
│       ├── layouts/, pages/, components/
└── docker-compose.yml          # MySQL local para desarrollo
```

## 4. Puesta en marcha (desarrollo local)

### Requisitos
Node.js 20+, MySQL 8 (o Docker), npm.

### 4.1. Base de datos
```bash
docker compose up -d mysql
# o, si ya tienes MySQL propio:
mysql -u root -p < backend/db/schema.sql
```

> **Si ya tenías la base creada de una entrega anterior**, esta ronda agregó
> la columna `activo` a `expediente_documentos` (para poder inactivar un
> documento subido por error, en vez de borrarlo). Aplica la migración con:
> ```sql
> ALTER TABLE expediente_documentos ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1 AFTER verificado;
> ```
> También se renombró la acción de permiso `eliminar` a `inactivar` en el
> catálogo de permisos: vuelve a correr `npm run seed` (es idempotente, no
> duplica roles/usuarios) para que se cree el permiso `*.inactivar` y se
> reasignen los roles con el nombre nuevo.
>
> **Cuarta ronda**: se agregaron las columnas `reset_password_token_hash`
> (`CHAR(64)`) y `reset_password_expira` (`DATETIME`) a `usuarios`, para la
> recuperación de contraseña por correo (sección 1.3). Aplica:
> ```sql
> ALTER TABLE usuarios ADD COLUMN reset_password_token_hash CHAR(64) NULL AFTER mfa_secret_cifrado;
> ALTER TABLE usuarios ADD COLUMN reset_password_expira DATETIME NULL AFTER reset_password_token_hash;
> ```
> Las columnas `mfa_habilitado`/`mfa_secret_cifrado` ya existían desde la
> ronda anterior (quedaron modeladas antes de tener el flujo TOTP completo);
> si tu base ya las tenía, no necesitas nada adicional para MFA.

### 4.2. Backend
```bash
cd backend
cp .env.example .env
# Genera secretos fuertes y complétalos en .env:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / CSRF_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # MFA_ENCRYPTION_KEY

npm install
npm run seed     # crea roles, permisos y usuarios de demostración
npm run dev      # http://localhost:4000
```

Usuarios de demostración creados por el seed (contraseña temporal
`Ditash#2026!`, se exige cambiarla en el primer login):

| Rol            | Email                     |
|----------------|----------------------------|
| SUPER_ADMIN    | superadmin@ditash.com      |
| ADMIN_EMPRESA  | rrhh@colautos.com           |
| COLABORADOR    | karen@colautos.com          |
| ESPECIALISTA   | liliana.gomez@ditash.com    |

### 4.3. Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev      # http://localhost:5173
```

## 5. APIs externas gratuitas usadas (ya integradas)

El sistema no depende de ningún servicio de pago para operar:

- **Videollamadas**: [Jitsi Meet](https://meet.jit.si) público, sin API key
  ni cuenta — cada cita genera una sala aleatoria propia
  (`backend/src/utils/videollamada.js`). El campo `enlace_reunion` de la
  tabla `citas` la guarda.
- **Correo transaccional**: cualquier SMTP estándar sirve (se sugiere
  [Brevo](https://www.brevo.com), 300 correos/día gratis, sin tarjeta).
  Completa `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` en `.env`; si los
  dejas vacíos, el sistema sigue funcionando y solo registra el contenido
  del correo en el log (`backend/src/utils/mailer.js`).
- **MFA (TOTP)**: `otplib` + `qrcode`, ambas librerías locales — no depende
  de ningún servicio externo, es compatible con cualquier app autenticadora
  estándar (RFC 6238).
- **Certificados en PDF**: `pdfkit`, generado en el propio servidor sin
  servicios externos.
- **Exportación de datos**: se implementó en el propio backend (ExcelJS),
  sin depender de servicios de terceros.

## 6. Seguridad — resumen de lo implementado

Ver detalle completo en [`SECURITY.md`](./SECURITY.md). Puntos clave:

- Contraseñas con **Argon2id** (no MD5/SHA/bcrypt puro).
- **JWT de acceso de vida corta (15 min)** + **refresh token con rotación y
  detección de reuso** (revoca toda la sesión si detecta un token robado),
  entregado en cookie `httpOnly` + `Secure` + `SameSite=Strict`.
- **RBAC granular**: cada endpoint exige un permiso explícito
  (`módulo.acción`), no solo un rol genérico.
- **Aislamiento multi-tenant**: un admin de RRHH nunca puede leer ni escribir
  datos de otra empresa, ni siquiera manipulando IDs en la URL (protección
  IDOR).
- **Validación estricta de entrada** con Zod en cada endpoint mutante
  (rechaza campos no declarados: mitiga *mass assignment*).
- **Cabeceras de seguridad** (Helmet: CSP, HSTS, X-Content-Type-Options,
  etc.), **CORS restringido**, **protección CSRF** (double-submit cookie) y
  **rate limiting** (general + estricto en login).
- **Auditoría inmutable** de acciones sensibles (login, exportaciones,
  cambios de usuarios/roles).
- **Subida de archivos segura**: lista blanca de tipos MIME, nombre de
  archivo generado por el servidor, límite de tamaño, hash SHA-256 de
  integridad.
- **Anonimato real** en encuestas de clima anónimas: el `colaborador_id`
  jamás se persiste cuando la encuesta es anónima (no solo se oculta en la
  interfaz).
- **Exportaciones (Excel)** protegidas contra *CSV injection* y sujetas
  a los mismos permisos que la lectura del módulo (el botón de CSV se
  retiró de la interfaz, pero el backend conserva `?format=csv`, igual de
  protegido, para integraciones).
- **MFA (TOTP) de autoservicio**: reto de login de un solo uso (JWT de 5
  minutos con `typ` propio, no reutilizable como sesión), secreto cifrado en
  reposo (AES-256-GCM) y desactivación que exige reconfirmar la contraseña.
- **Recuperación de contraseña resistente a enumeración**: misma respuesta
  exista o no la cuenta, token de un solo uso comparado en tiempo constante
  (`crypto.timingSafeEqual`), expira en 30 minutos y cierra todas las
  sesiones activas al usarse.

## 7. Módulo de Usuarios, Roles y Permisos (lo que el prototipo no tenía)

El prototipo declaraba explícitamente que "por ser un prototipo no hubo
manejo de roles, usuarios y permisos". Este entregable lo resuelve con:

- CRUD completo de **Usuarios**, con todos los campos editables (nombre,
  rol, empresa, cargo, área, teléfono), bloqueo/desbloqueo, reseteo de
  contraseña e **inactivación** (nunca borrado) con exportación a CSV/Excel.
  Al crear/editar, el rol seleccionado determina dinámicamente qué campos
  adicionales se piden (empresa para roles internos, especialidad/tarifa
  para especialistas).
- CRUD completo de **Roles** con asignación granular de permisos por
  módulo y acción (crear/leer/actualizar/eliminar/exportar) e inactivación.
- Catálogo de **Permisos** (solo lectura, generado desde una única fuente
  de verdad en el código para que nunca queden desincronizados con las
  rutas reales de la API).
- CRUD de **Empresas** (solo `SUPER_ADMIN`), **Categorías de bienestar**
  (con su lista de servicios/items anidados editable), **Cursos**,
  **Competencias** y administración de **Especialistas** del marketplace
  (verificación explícita + inactivación), todos con exportación.
- Directorio de **Colaboradores** por empresa (lectura + exportación; la
  edición de datos de cuenta se hace desde "Usuarios" para no duplicar la
  fuente de verdad).
- Los 4 roles de negocio (`SUPER_ADMIN`, `ADMIN_EMPRESA`, `COLABORADOR`,
  `ESPECIALISTA`) vienen preconfigurados por el seed, pero son solo el
  punto de partida: desde el panel de administración se pueden crear roles
  adicionales (ej. "Supervisor SST", "Auditor de Clima") con permisos a la
  medida.
- **Prevención de escalada de privilegios**: un `ADMIN_EMPRESA` no puede
  crear ni promover usuarios a `SUPER_ADMIN`, ni crear `ESPECIALISTA`
  (exclusivo del panel global), ni reasignar un usuario a otra empresa —
  validado en el backend independientemente de lo que el frontend muestre.

## 8. Despliegue a producción (plantillas)

`docker-compose.yml` (raíz) y `npm run dev` son solo para desarrollo local.
En `deploy/` hay plantillas de arranque para producción — **no listas para
usar tal cual**: requieren el dominio, certificado TLS y proveedor de
hosting/base de datos que solo tú puedes decidir, y están señaladas con
`<...>` donde falta completar un valor propio.

- `deploy/docker-compose.prod.yml` + `backend/Dockerfile`: backend en un
  contenedor sin privilegios de root, MySQL sin puerto expuesto a Internet,
  Nginx como único punto público.
- `deploy/nginx.conf.example`: reverse proxy con TLS, HSTS, cabeceras de
  seguridad y proxy hacia `/api` del backend.
- `deploy/ecosystem.config.js`: alternativa sin Docker, para correr el
  backend con PM2 en modo cluster en un VPS propio.
- `deploy/CHECKLIST.md`: lista de verificación completa (secretos, backups,
  TLS, firewall, monitoreo) antes de anunciar el sistema a usuarios reales.
