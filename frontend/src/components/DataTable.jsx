import Paginator from './Paginator';
import { usePaginacion, TAMANO_PAGINA_POR_DEFECTO } from '../hooks/usePaginacion';

// Tabla genérica y accesible para los módulos de administración (Usuarios,
// Roles, Permisos, etc.). `columns`: [{ key, header, render? }]
//
// Pagina en el cliente por defecto (12 filas por página, ver
// TAMANO_PAGINA_POR_DEFECTO): antes mostraba TODAS las filas de una vez,
// lo que volvía interminables las tablas con muchos registros. `paginar`
// se puede desactivar para listas ya cortas por naturaleza, y
// `tamanoPaginaInicial` deja parametrizar el valor por defecto de una
// tabla en particular (el usuario igual puede cambiarlo desde el
// selector del Paginator, y esa elección se recuerda por tabla vía
// `claveGuardado`).
export default function DataTable({
  columns,
  rows,
  acciones,
  paginar = true,
  tamanoPaginaInicial = TAMANO_PAGINA_POR_DEFECTO,
  claveGuardado,
}) {
  const { pagina, setPagina, tamanoPagina, cambiarTamanoPagina } = usePaginacion({
    clave: claveGuardado,
    tamanoInicial: tamanoPaginaInicial,
  });

  const totalPaginas = paginar ? Math.max(1, Math.ceil(rows.length / tamanoPagina)) : 1;
  const paginaSegura = Math.min(pagina, totalPaginas);
  const filas = paginar ? rows.slice((paginaSegura - 1) * tamanoPagina, paginaSegura * tamanoPagina) : rows;

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.header}</th>
            ))}
            {acciones && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (acciones ? 1 : 0)} className="empty-state">
                No hay registros para mostrar.
              </td>
            </tr>
          )}
          {filas.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? '')}</td>
              ))}
              {acciones && <td className="acciones-cell">{acciones(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {paginar && rows.length > 0 && (
        <Paginator
          page={paginaSegura}
          totalItems={rows.length}
          pageSize={tamanoPagina}
          onPageChange={setPagina}
          onPageSizeChange={cambiarTamanoPagina}
        />
      )}
    </div>
  );
}
