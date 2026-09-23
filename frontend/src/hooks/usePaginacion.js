import { useEffect, useState } from 'react';

// Tamaño de página por defecto para cualquier lista/tabla del proyecto que
// no indique uno propio. 12 es el máximo pedido para el proyecto; sigue
// siendo parametrizable por lista (parámetro `tamanoInicial`) y, sobre
// todo, por el propio usuario desde el selector del Paginator.
export const TAMANO_PAGINA_POR_DEFECTO = 12;

// Estado de paginación reutilizable para listas paginadas en el cliente
// (ver DataTable.jsx). `clave`, si se pasa, recuerda en localStorage el
// tamaño de página que el usuario eligió para ESA lista en particular
// (distintas tablas pueden preferir distintos tamaños), para que no haya
// que volver a elegirlo cada vez que entra a la pantalla.
export function usePaginacion({ clave, tamanoInicial = TAMANO_PAGINA_POR_DEFECTO } = {}) {
  const [pagina, setPagina] = useState(1);
  const [tamanoPagina, setTamanoPagina] = useState(() => {
    if (!clave) return tamanoInicial;
    try {
      const guardado = window.localStorage.getItem(`ditash:paginacion:${clave}`);
      return guardado ? Number(guardado) || tamanoInicial : tamanoInicial;
    } catch {
      return tamanoInicial;
    }
  });

  useEffect(() => {
    if (!clave) return;
    try {
      window.localStorage.setItem(`ditash:paginacion:${clave}`, String(tamanoPagina));
    } catch {
      // localStorage puede fallar (modo privado, cuota llena, etc.): no es
      // crítico, simplemente no se recuerda la preferencia.
    }
  }, [clave, tamanoPagina]);

  function cambiarTamanoPagina(nuevoTamano) {
    setTamanoPagina(nuevoTamano);
    setPagina(1); // cambiar el tamaño reinicia a la primera página, evita quedar "fuera de rango"
  }

  return { pagina, setPagina, tamanoPagina, cambiarTamanoPagina };
}
