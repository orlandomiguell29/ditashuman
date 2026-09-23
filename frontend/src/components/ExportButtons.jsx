import api from '../api/axiosClient';
import { IconDownload } from './icons';

// Descarga el export (XLSX) reutilizando la sesión autenticada de axios
// (no se usa un <a href> directo porque necesitaría el token en la URL,
// exponiéndolo en logs del navegador/servidor).
// Nota: el botón de CSV se retiró de toda la interfaz por pedido explícito
// del usuario — Excel cubre el mismo caso de uso y evita duplicar el botón.
// El backend conserva `?format=csv` en cada endpoint de exportación (no se
// quitó la capacidad, solo el botón), por si algún día se necesita de nuevo
// o para integraciones que prefieran CSV.
async function descargar(endpoint, nombreArchivo) {
  const { data } = await api.get(endpoint, { params: { format: 'xlsx' }, responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${nombreArchivo}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function ExportButtons({ endpoint, nombreArchivo, disabled }) {
  if (disabled) return null;
  return (
    <div className="export-buttons">
      <button type="button" className="btn-export" onClick={() => descargar(endpoint, nombreArchivo)}>
        <IconDownload width={14} height={14} />
        Exportar Excel
      </button>
    </div>
  );
}
