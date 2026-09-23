// Paginador reutilizable, genérico para cualquier lista/tabla del proyecto.
// Es "tonto" a propósito (no sabe nada de la fuente de datos): recibe la
// página actual y el total de elementos, y avisa por `onPageChange` /
// `onPageSizeChange` cuando el usuario interactúa. Quien lo usa decide si
// pagina en el cliente (cortando un arreglo ya cargado, ver DataTable.jsx)
// o en el servidor (pidiendo la página nueva a la API).
//
// `pageSizeOptions` trae el tamaño de página parametrizable por el propio
// usuario desde la interfaz (no solo un valor fijo en el código): por
// defecto son múltiplos de 12 (el máximo pedido), y el que se use se
// recuerda en `localStorage` por pantalla (ver `usePaginacion` más abajo)
// para que no haya que volver a elegirlo cada vez.
export default function Paginator({
  page,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [12, 24, 48, 96],
}) {
  const totalPaginas = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginaSegura = Math.min(Math.max(1, page), totalPaginas);

  if (totalItems === 0) return null;

  const desde = (paginaSegura - 1) * pageSize + 1;
  const hasta = Math.min(paginaSegura * pageSize, totalItems);

  // Ventana corta de números de página alrededor de la actual, para no
  // renderizar cientos de botones si hay muchas páginas.
  const numeros = [];
  const inicio = Math.max(1, paginaSegura - 2);
  const fin = Math.min(totalPaginas, inicio + 4);
  for (let n = Math.max(1, fin - 4); n <= fin; n += 1) numeros.push(n);

  return (
    <div className="paginator">
      <span className="paginator-resumen">
        {desde}–{hasta} de {totalItems}
      </span>

      <div className="paginator-controles">
        <button type="button" className="btn-xs" disabled={paginaSegura <= 1} onClick={() => onPageChange(1)} data-tooltip="Primera página">
          «
        </button>
        <button type="button" className="btn-xs" disabled={paginaSegura <= 1} onClick={() => onPageChange(paginaSegura - 1)} data-tooltip="Anterior">
          ‹
        </button>
        {numeros.map((n) => (
          <button
            key={n}
            type="button"
            className={`btn-xs ${n === paginaSegura ? 'paginator-pagina-activa' : ''}`}
            onClick={() => onPageChange(n)}
          >
            {n}
          </button>
        ))}
        <button type="button" className="btn-xs" disabled={paginaSegura >= totalPaginas} onClick={() => onPageChange(paginaSegura + 1)} data-tooltip="Siguiente">
          ›
        </button>
        <button type="button" className="btn-xs" disabled={paginaSegura >= totalPaginas} onClick={() => onPageChange(totalPaginas)} data-tooltip="Última página">
          »
        </button>
      </div>

      {onPageSizeChange && (
        <label className="paginator-tamano">
          Por página:
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
