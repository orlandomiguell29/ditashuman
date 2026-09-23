-- =============================================================================
-- Cambia el correo (y en un caso el nombre) de dos usuarios puntuales.
-- `usuarios.email` es UNIQUE, así que el UPDATE falla solo si el correo
-- nuevo ya está en uso por otra cuenta (poco probable aquí, pero por si
-- acaso el SELECT de verificación del final lo confirma).
--
-- CÓMO USARLO: pégalo completo en phpMyAdmin (pestaña SQL) y ejecútalo.
-- =============================================================================

START TRANSACTION;

-- karen@colautos.com -> jhonruiz@ditash.com, con nombre "Jhon Ruiz"
UPDATE usuarios
SET email = 'jhonruiz@ditash.com', nombre = 'Jhon Ruiz'
WHERE email = 'karen@colautos.com';

-- rrhh@colautos.com -> rrhh@ditash.com, conservando el nombre actual del empleado
UPDATE usuarios
SET email = 'rrhh@ditash.com'
WHERE email = 'rrhh@colautos.com';

COMMIT;

-- Verificación: confirma que ambos usuarios quedaron con el correo nuevo.
SELECT id, nombre, email, estado
FROM usuarios
WHERE email IN ('jhonruiz@ditash.com', 'rrhh@ditash.com');
