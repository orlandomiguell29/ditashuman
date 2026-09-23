-- Elimina los usuarios "fantasma" que el seed recreó por error en cada
-- restart del backend (ver backend/db/seed.js), después de que el script
-- anterior (cambiar-correos-usuarios.sql) renombró karen@colautos.com ->
-- jhonruiz@ditash.com y rrhh@colautos.com -> rrhh@ditash.com.
--
-- Una vez esas cuentas se renombraron, el correo original dejó de existir,
-- así que el siguiente restart del backend volvió a crearlas desde cero con
-- el correo viejo (karen@colautos.com / rrhh@colautos.com) como filas NUEVAS
-- y duplicadas. Este script borra esas filas fantasma. El fix de fondo (que
-- el seed ya no vuelva a recrearlas en ningún restart futuro) va en el
-- código, no aquí.
--
-- IMPORTANTE: correr esto SOLO DESPUÉS de actualizar el backend con el fix
-- del seed. Si se corre antes y el backend todavía tiene el bug, las filas
-- fantasma simplemente reaparecerán en el próximo restart.

START TRANSACTION;

-- 1) Vista previa de lo que se va a borrar (revisa que sean, en efecto, las
--    cuentas fantasma antes de seguir).
SELECT id, nombre, email, rol_id, empresa_id
FROM usuarios
WHERE email IN ('karen@colautos.com', 'rrhh@colautos.com');

-- 2) Por si alguna de esas cuentas fantasma alcanzó a agendar/participar en
--    algo antes de que lo notaras (poco probable si lo detectaste rápido,
--    pero mejor cubrirlo): limpia primero citas y auditoría asociadas,
--    ANTES de tocar `colaboradores` (si se borrara antes, esta consulta ya
--    no podría encontrar la relación).
DELETE ci FROM citas ci
INNER JOIN colaboradores co ON co.id = ci.colaborador_id
INNER JOIN usuarios u ON u.id = co.usuario_id
WHERE u.email IN ('karen@colautos.com', 'rrhh@colautos.com');

DELETE a FROM auditoria a
INNER JOIN usuarios u ON u.id = a.usuario_id
WHERE u.email IN ('karen@colautos.com', 'rrhh@colautos.com');

-- 3) Ahora sí la fila en `colaboradores` (la de karen@colautos.com, con rol
--    COLABORADOR, siempre la tiene, porque el seed crea ese registro
--    automáticamente) — hay que borrarla antes que el usuario para no dejar
--    una fila huérfana.
DELETE c FROM colaboradores c
INNER JOIN usuarios u ON u.id = c.usuario_id
WHERE u.email IN ('karen@colautos.com', 'rrhh@colautos.com');

-- 4) Ahora sí, las cuentas fantasma.
DELETE FROM usuarios
WHERE email IN ('karen@colautos.com', 'rrhh@colautos.com');

-- 5) Verificación: no debe devolver ninguna fila.
SELECT id, nombre, email FROM usuarios WHERE email IN ('karen@colautos.com', 'rrhh@colautos.com');

COMMIT;
