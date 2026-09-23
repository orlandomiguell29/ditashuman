# Checklist de despliegue a producción

Estas plantillas (`docker-compose.prod.yml`, `nginx.conf.example`,
`ecosystem.config.js`, `backend/Dockerfile`) son un **punto de partida**, no
una infraestructura lista para usar: requieren el dominio, el certificado
TLS y el proveedor de hosting/base de datos que solo tú puedes elegir. Antes
de salir a producción real, verifica cada punto:

## Secretos y configuración
- [ ] `backend/.env` generado con secretos propios y fuertes (no los valores
      de ejemplo). Genera cada uno con
      `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
      (JWT/CSRF) o `...randomBytes(32)...` (MFA_ENCRYPTION_KEY).
- [ ] Secretos guardados en un gestor (Vault, AWS Secrets Manager, Doppler,
      variables de entorno del proveedor de hosting) — nunca en el repo ni
      en un `.env` sin cifrar en el servidor.
- [ ] `NODE_ENV=production`, `COOKIE_SECURE=true`, `DB_PASSWORD` no vacío —
      el backend ya se niega a arrancar en producción si falta alguno de
      estos (ver `backend/src/config/env.js`).
- [ ] `CORS_ORIGIN` apunta exactamente a tu dominio (nunca `*`).
- [ ] SMTP real configurado (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`)
      — sin esto, los correos de recuperación de contraseña, bienvenida y
      citas no se envían de verdad, solo quedan en el log.
- [ ] `FRONTEND_URL` apunta al dominio público real (se usa para construir
      el enlace de recuperación de contraseña).

## Base de datos
- [ ] MySQL gestionado o con backups automáticos configurados (el
      contenedor de `docker-compose.prod.yml` NO los hace por sí solo).
- [ ] `backend/db/schema.sql` aplicado y `npm run seed` corrido una sola vez
      (cambia la contraseña temporal de los usuarios demo o bórralos antes
      de ir a producción real).
- [ ] Backups probados con una restauración real, no solo el cron
      corriendo — un backup nunca verificado no es un backup confiable.

## Red y TLS
- [ ] Certificado TLS válido (Let's Encrypt/Certbot con renovación
      automática, o el que entregue tu proveedor/CDN) en las rutas que
      referencia `nginx.conf.example`.
- [ ] HSTS activo (ya incluido en la plantilla de Nginx) solo después de
      confirmar que HTTPS funciona de forma estable.
- [ ] Puerto 3306 (MySQL) y 4000 (backend Node) **no expuestos** a Internet
      — solo Nginx debe ser público (ya reflejado en
      `docker-compose.prod.yml` con `expose` en vez de `ports`).
- [ ] Firewall del proveedor (Security Group, UFW, etc.) permite solo
      80/443 entrantes hacia el servidor.

## Aplicación
- [ ] `npm run build` del frontend ejecutado y el resultado (`frontend/dist`)
      es el que sirve Nginx — nunca `npm run dev` en producción.
- [ ] Carpeta `uploads/` del backend en un volumen persistente (Docker) o
      ruta con backup — ahí viven los documentos del expediente.
- [ ] Proceso del backend supervisado (PM2 `ecosystem.config.js` o el
      `restart: unless-stopped` de Docker) para que se reinicie solo ante
      un crash.

## Monitoreo y auditoría
- [ ] Logs del backend centralizados (el `morgan`/logger ya existente
      escribe a stdout; falta enviarlos a un colector externo — CloudWatch,
      Datadog, un ELK propio, etc.) para alertas y SIEM real.
- [ ] Tabla de auditoría (`auditoria`, ya implementada) con retención y
      revisión periódica definidas por el equipo de seguridad/cumplimiento.

## Antes de anunciar el sistema a los usuarios finales
- [ ] Recorrido manual completo de los 4 roles en el entorno de producción
      real (no solo en local).
- [ ] Usuarios demo del seed (`superadmin@ditash.com`, etc.) desactivados o
      con contraseña rotada si el seed se corrió en la base de producción.
