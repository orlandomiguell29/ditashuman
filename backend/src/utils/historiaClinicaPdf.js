const PDFDocument = require('pdfkit');

// Genera el PDF de una historia clínica puntual (una cita, una nota), en
// memoria (Buffer) — igual criterio que certificados.js: nunca se persiste
// en disco, se regenera bajo demanda a partir de lo que ya está en la base
// de datos, así el PDF siempre refleja el estado real (y no hay archivos
// confidenciales que proteger aparte). A diferencia del certificado (una
// sola página de layout fijo), aquí el contenido es de longitud variable
// (notas clínicas largas), así que se usa el flujo normal de PDFKit
// (.text() sin coordenadas absolutas) para que pagine solo si hace falta.
function generarHistoriaClinicaPdf({
  paciente,
  especialistaNombre,
  especialidad,
  citaFecha,
  historia,
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const AZUL = '#1d4ed8';
      const TEXTO_PRINCIPAL = '#0f172a';
      const TEXTO_SUAVE = '#475569';
      const TEXTO_TENUE = '#94a3b8';

      // Encabezado de marca, igual tono que el resto de documentos generados
      // por la plataforma (certificados).
      doc.fillColor(TEXTO_TENUE).font('Helvetica-Bold').fontSize(10)
        .text('DITASH HUMAN+ · PLATAFORMA DE BIENESTAR CORPORATIVO', { characterSpacing: 0.5 });
      doc.moveDown(0.3);
      doc.fillColor(TEXTO_PRINCIPAL).font('Helvetica-Bold').fontSize(20).text('Historia clínica');
      doc.moveDown(0.6);
      doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
      doc.moveDown(0.8);

      // Aviso de confidencialidad arriba de todo, antes de cualquier dato
      // clínico — para que quede visible de inmediato si el PDF se imprime
      // o se comparte por error.
      doc.fillColor('#991b1b').font('Helvetica-Bold').fontSize(9)
        .text('DOCUMENTO CONFIDENCIAL — Uso exclusivo del especialista tratante y del paciente. Contiene información de salud protegida.');
      doc.moveDown(1);

      const fechaCitaTexto = citaFecha
        ? new Date(citaFecha).toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' })
        : '—';

      const campoCabecera = (etiqueta, valor) => {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXTO_SUAVE).text(etiqueta, { continued: true });
        doc.font('Helvetica').fillColor(TEXTO_PRINCIPAL).text(` ${valor || '—'}`);
      };

      campoCabecera('Paciente:', paciente);
      campoCabecera('Especialista:', especialidad ? `${especialistaNombre} (${especialidad})` : especialistaNombre);
      campoCabecera('Fecha de la cita:', fechaCitaTexto);
      campoCabecera(
        'Estado de la nota:',
        historia.estado === 'finalizada'
          ? `Finalizada el ${new Date(historia.finalizada_en).toLocaleDateString('es-CO')}`
          : 'Borrador (aún editable)'
      );
      doc.moveDown(1);

      const seccion = (titulo, texto) => {
        doc.font('Helvetica-Bold').fontSize(12).fillColor(AZUL).text(titulo);
        doc.moveDown(0.2);
        doc.font('Helvetica').fontSize(10.5).fillColor(TEXTO_PRINCIPAL).text(texto && texto.trim() ? texto : 'Sin información registrada.', {
          align: 'justify',
        });
        doc.moveDown(1);
      };

      seccion('Motivo de consulta', historia.motivo_consulta);
      seccion('Resumen de la sesión', historia.resumen_sesion);
      seccion('Análisis / impresión diagnóstica', historia.analisis_diagnostico);
      seccion('Plan de intervención', historia.plan_intervencion);
      seccion('Recomendaciones', historia.recomendaciones);

      const NIVEL_RIESGO_TEXTO = { ninguno: 'Ninguno', bajo: 'Bajo', medio: 'Medio', alto: 'Alto' };
      campoCabecera('Nivel de riesgo percibido:', NIVEL_RIESGO_TEXTO[historia.nivel_riesgo] || historia.nivel_riesgo);
      campoCabecera(
        'Próxima cita recomendada:',
        historia.proxima_cita_recomendada
          ? new Date(historia.proxima_cita_recomendada).toLocaleDateString('es-CO', { dateStyle: 'long' })
          : 'No se registró'
      );

      // Pie de página con fecha/hora de generación, en cada página que
      // PDFKit haya tenido que agregar por contenido largo.
      const piePagina = () => {
        const y = doc.page.height - doc.page.margins.bottom + 10;
        doc.fontSize(8).fillColor(TEXTO_TENUE).font('Helvetica').text(
          `Generado automáticamente por DITASH Human+ el ${new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })} · Documento confidencial`,
          doc.page.margins.left,
          y,
          { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
        );
      };
      piePagina();
      doc.on('pageAdded', piePagina);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

const NIVEL_RIESGO_TEXTO = { ninguno: 'Ninguno', bajo: 'Bajo', medio: 'Medio', alto: 'Alto' };

// Historial consolidado: TODAS las sesiones finalizadas de un paciente con
// un mismo especialista, en un solo PDF (una sección por sesión, en orden
// cronológico). Reutiliza el mismo criterio de "confidencial" y de pie de
// página que generarHistoriaClinicaPdf, pero con más contenido junto, por
// lo que el llamador (especialistaController.descargarHistorialConsolidadoPdf)
// restringe esto a sesiones 'finalizada' únicamente.
function generarHistoriaClinicaConsolidadaPdf({ paciente, especialistaNombre, especialidad, sesiones }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const AZUL = '#1d4ed8';
      const TEXTO_PRINCIPAL = '#0f172a';
      const TEXTO_SUAVE = '#475569';
      const TEXTO_TENUE = '#94a3b8';

      doc.fillColor(TEXTO_TENUE).font('Helvetica-Bold').fontSize(10)
        .text('DITASH HUMAN+ · PLATAFORMA DE BIENESTAR CORPORATIVO', { characterSpacing: 0.5 });
      doc.moveDown(0.3);
      doc.fillColor(TEXTO_PRINCIPAL).font('Helvetica-Bold').fontSize(20).text('Historial clínico consolidado');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(11).fillColor(TEXTO_SUAVE).text(
        `${sesiones.length} ${sesiones.length === 1 ? 'sesión finalizada' : 'sesiones finalizadas'} · ${paciente} · ${especialidad ? `${especialistaNombre} (${especialidad})` : especialistaNombre}`
      );
      doc.moveDown(0.6);

      doc.fillColor('#991b1b').font('Helvetica-Bold').fontSize(9)
        .text('DOCUMENTO CONFIDENCIAL — Uso exclusivo del especialista tratante y del paciente. Contiene información de salud protegida de varias sesiones.');
      doc.moveDown(1);

      sesiones.forEach((hc, idx) => {
        if (idx > 0) {
          doc.moveDown(0.4);
          doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
          doc.moveDown(0.8);
        }

        const fechaTexto = hc.Cita?.fecha_hora
          ? new Date(hc.Cita.fecha_hora).toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' })
          : '—';
        doc.font('Helvetica-Bold').fontSize(13).fillColor(AZUL).text(`Sesión del ${fechaTexto}`);
        doc.moveDown(0.3);

        const campo = (etiqueta, valor) => {
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXTO_SUAVE).text(etiqueta, { continued: true });
          doc.font('Helvetica').fontSize(9.5).fillColor(TEXTO_PRINCIPAL).text(` ${valor && String(valor).trim() ? valor : 'Sin información registrada.'}`);
        };

        campo('Motivo de consulta:', hc.motivo_consulta);
        campo('Resumen de la sesión:', hc.resumen_sesion);
        campo('Análisis / impresión diagnóstica:', hc.analisis_diagnostico);
        campo('Plan de intervención:', hc.plan_intervencion);
        campo('Recomendaciones:', hc.recomendaciones);
        campo('Nivel de riesgo percibido:', NIVEL_RIESGO_TEXTO[hc.nivel_riesgo] || hc.nivel_riesgo);
        doc.moveDown(0.6);
      });

      const piePagina = () => {
        const y = doc.page.height - doc.page.margins.bottom + 10;
        doc.fontSize(8).fillColor(TEXTO_TENUE).font('Helvetica').text(
          `Generado automáticamente por DITASH Human+ el ${new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })} · Documento confidencial`,
          doc.page.margins.left,
          y,
          { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
        );
      };
      piePagina();
      doc.on('pageAdded', piePagina);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generarHistoriaClinicaPdf, generarHistoriaClinicaConsolidadaPdf };
