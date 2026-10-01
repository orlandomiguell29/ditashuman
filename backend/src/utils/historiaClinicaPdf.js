const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Generación de PDFs de historia clínica (una nota, o el historial
// consolidado de un paciente). Se construyen en memoria (Buffer) y nunca se
// guardan en disco — igual criterio que utils/certificados.js: se regeneran
// en cada descarga a partir de la base de datos.
//
// Diseño: encabezado con el logo oficial, ficha de datos de la atención en
// tabla, secciones clínicas separadas con título y espacio propio, nivel de
// riesgo como etiqueta de color, bloque de firma del profesional y pie de
// página con numeración en TODAS las páginas.
//
// Pie de página sin página en blanco de más: PDFKit agrega una página nueva
// automáticamente si se escribe por debajo del margen inferior (el mismo
// problema que se documentó en certificados.js). Por eso el documento se
// crea con `bufferPages: true`, se escribe todo el contenido primero y los
// pies se dibujan al final recorriendo cada página con el margen inferior
// temporalmente en 0 — así nunca se dispara un salto de página.

const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo-certificado.png');
const LOGO_DISPONIBLE = fs.existsSync(LOGO_PATH);
const LOGO_RATIO_ALTO_ANCHO = 701 / 723;

const C = {
  primario: '#1746a2',
  primarioOscuro: '#0f3175',
  primarioClaro: '#e2eaf9',
  verde: '#5a9c4a',
  texto: '#1e293b',
  suave: '#475569',
  tenue: '#94a3b8',
  borde: '#dbe3ee',
  fondo: '#f8fafc',
  peligro: '#991b1b',
  peligroFondo: '#fef2f2',
  peligroBorde: '#fecaca',
};

const RIESGO = {
  ninguno: { texto: 'Ninguno', fondo: '#f1f5f9', color: '#475569' },
  bajo: { texto: 'Bajo', fondo: '#dcfce7', color: '#166534' },
  medio: { texto: 'Medio', fondo: '#fef3c7', color: '#92400e' },
  alto: { texto: 'Alto', fondo: '#fee2e2', color: '#991b1b' },
};

const MARGEN = 50;
const ALTO_PIE = 40; // espacio reservado abajo para el pie de página

const SECCIONES = [
  ['motivo_consulta', 'Motivo de consulta'],
  ['resumen_sesion', 'Resumen de la sesión'],
  ['analisis_diagnostico', 'Análisis / impresión diagnóstica'],
  ['plan_intervencion', 'Plan de intervención'],
  ['recomendaciones', 'Recomendaciones'],
];

// ---------- utilidades de formato ----------

function fechaLarga(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' });
}

function fechaCorta(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Las columnas DATEONLY llegan como 'YYYY-MM-DD': `new Date('2026-10-05')`
// se interpreta en UTC y en Colombia (UTC-5) se mostraría el día ANTERIOR.
// Se fija al mediodía local para que la fecha nunca se corra.
function fechaSoloDia(valor) {
  if (!valor) return null;
  const texto = String(valor).slice(0, 10);
  return new Date(`${texto}T12:00:00`);
}

function estadoNota(historia) {
  if (historia.estado === 'finalizada') return `Finalizada el ${fechaCorta(historia.finalizada_en)}`;
  if (historia.estado === 'anulada') return `Anulada el ${fechaCorta(historia.anulada_en)}`;
  return 'Borrador (en edición)';
}

function registro(id) {
  return `HC-${String(id).padStart(6, '0')}`;
}

// ---------- utilidades de dibujo ----------

function anchoUtil(doc) {
  return doc.page.width - MARGEN * 2;
}

function limiteInferior(doc) {
  return doc.page.height - doc.page.margins.bottom;
}

function asegurarEspacio(doc, alto) {
  if (doc.y + alto > limiteInferior(doc)) {
    doc.addPage();
  }
  doc.x = MARGEN;
}

function crearDocumento(titulo) {
  return new PDFDocument({
    size: 'A4',
    margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: MARGEN + ALTO_PIE },
    bufferPages: true,
    info: { Title: titulo, Author: 'DITASH Human+', Creator: 'DITASH Human+' },
  });
}

function encabezado(doc, { titulo, subtitulo, detalle }) {
  const x = MARGEN;
  const ancho = anchoUtil(doc);
  const y = MARGEN - 18;
  const logoAncho = 82;
  const logoAlto = logoAncho * LOGO_RATIO_ALTO_ANCHO;

  if (LOGO_DISPONIBLE) {
    doc.image(LOGO_PATH, x, y, { width: logoAncho, height: logoAlto });
  } else {
    doc.fillColor(C.primario).font('Helvetica-Bold').fontSize(18).text('DITASH Human+', x, y + 28, { lineBreak: false });
  }

  const xDerecha = x + logoAncho + 20;
  const anchoDerecha = ancho - logoAncho - 20;
  doc.fillColor(C.primarioOscuro).font('Helvetica-Bold').fontSize(21)
    .text(titulo, xDerecha, y + 16, { width: anchoDerecha, align: 'right' });
  doc.fillColor(C.suave).font('Helvetica').fontSize(10)
    .text(subtitulo, xDerecha, doc.y + 2, { width: anchoDerecha, align: 'right' });
  if (detalle) {
    doc.fillColor(C.tenue).font('Helvetica').fontSize(8.5)
      .text(detalle, xDerecha, doc.y + 3, { width: anchoDerecha, align: 'right' });
  }

  const yLinea = y + logoAlto + 6;
  doc.rect(x, yLinea, ancho * 0.72, 2.5).fill(C.primario);
  doc.rect(x + ancho * 0.72, yLinea, ancho * 0.28, 2.5).fill(C.verde);
  doc.x = x;
  doc.y = yLinea + 16;
}

function aviso(doc, texto, { fondo = C.peligroFondo, borde = C.peligroBorde, color = C.peligro } = {}) {
  const x = MARGEN;
  const ancho = anchoUtil(doc);
  const pad = 9;
  doc.font('Helvetica-Bold').fontSize(8.5);
  const alto = doc.heightOfString(texto, { width: ancho - pad * 2 }) + pad * 2;
  asegurarEspacio(doc, alto + 10);
  const y = doc.y;
  doc.roundedRect(x, y, ancho, alto, 5).lineWidth(0.8).fillAndStroke(fondo, borde);
  doc.fillColor(color).font('Helvetica-Bold').fontSize(8.5).text(texto, x + pad, y + pad, { width: ancho - pad * 2 });
  doc.x = x;
  doc.y = y + alto + 16;
}

function tituloBloque(doc, texto) {
  const x = MARGEN;
  const y = doc.y;
  doc.rect(x, y + 1, 3, 11).fill(C.primario);
  doc.fillColor(C.primario).font('Helvetica-Bold').fontSize(9)
    .text(texto.toUpperCase(), x + 10, y, { width: anchoUtil(doc) - 10, characterSpacing: 0.6 });
  doc.x = x;
  doc.y += 6;
}

// Ficha de datos en dos columnas: cada fila es [[etiqueta, valor], [etiqueta, valor]].
function tablaDatos(doc, filas) {
  const x = MARGEN;
  const ancho = anchoUtil(doc);
  const anchoCol = ancho / 2;
  const pad = 10;
  const altoEtiqueta = 11;

  doc.font('Helvetica-Bold').fontSize(10);
  const alturas = filas.map((fila) => {
    const maxValor = Math.max(...fila.map(([, valor]) => doc.heightOfString(valor || '—', { width: anchoCol - pad * 2 })));
    return pad + altoEtiqueta + 3 + maxValor + pad;
  });
  const altoTotal = alturas.reduce((a, b) => a + b, 0);

  asegurarEspacio(doc, altoTotal + 10);
  const y0 = doc.y;
  doc.roundedRect(x, y0, ancho, altoTotal, 6).lineWidth(0.8).fillAndStroke(C.fondo, C.borde);
  doc.moveTo(x + anchoCol, y0).lineTo(x + anchoCol, y0 + altoTotal).lineWidth(0.6).strokeColor(C.borde).stroke();

  let y = y0;
  filas.forEach((fila, i) => {
    if (i > 0) doc.moveTo(x, y).lineTo(x + ancho, y).lineWidth(0.6).strokeColor(C.borde).stroke();
    fila.forEach(([etiqueta, valor], col) => {
      const cx = x + col * anchoCol + pad;
      doc.fillColor(C.tenue).font('Helvetica-Bold').fontSize(7.5)
        .text(etiqueta.toUpperCase(), cx, y + pad, { width: anchoCol - pad * 2, characterSpacing: 0.5, lineBreak: false });
      doc.fillColor(C.texto).font('Helvetica-Bold').fontSize(10)
        .text(valor || '—', cx, y + pad + altoEtiqueta + 3, { width: anchoCol - pad * 2 });
    });
    y += alturas[i];
  });

  doc.x = x;
  doc.y = y0 + altoTotal + 20;
}

function seccion(doc, titulo, texto, { omitirVacia = false } = {}) {
  const contenido = texto && String(texto).trim();
  if (!contenido && omitirVacia) return;

  // Título + al menos dos líneas de texto juntos: nunca un título suelto al
  // final de una página con su contenido en la siguiente.
  asegurarEspacio(doc, 55);
  tituloBloque(doc, titulo);
  const x = MARGEN + 10;
  const ancho = anchoUtil(doc) - 10;
  if (contenido) {
    doc.fillColor(C.texto).font('Helvetica').fontSize(10.5)
      .text(contenido, x, doc.y, { width: ancho, align: 'justify', lineGap: 2.5 });
  } else {
    doc.fillColor(C.tenue).font('Helvetica-Oblique').fontSize(10)
      .text('Sin información registrada.', x, doc.y, { width: ancho });
  }
  doc.x = MARGEN;
  doc.y += 18;
}

function etiquetaRiesgo(doc, nivel, { titulo = 'Nivel de riesgo percibido' } = {}) {
  const r = RIESGO[nivel] || RIESGO.ninguno;
  asegurarEspacio(doc, 45);
  tituloBloque(doc, titulo);
  const x = MARGEN + 10;
  const y = doc.y + 1;
  doc.font('Helvetica-Bold').fontSize(9);
  const ancho = doc.widthOfString(r.texto) + 22;
  doc.roundedRect(x, y, ancho, 18, 9).fill(r.fondo);
  doc.fillColor(r.color).font('Helvetica-Bold').fontSize(9).text(r.texto, x + 11, y + 5, { lineBreak: false });
  doc.x = MARGEN;
  doc.y = y + 18 + 18;
}

function bloqueFirma(doc, nombre, especialidad) {
  asegurarEspacio(doc, 95);
  doc.y += 34;
  const x = MARGEN;
  const y = doc.y;
  doc.moveTo(x, y).lineTo(x + 230, y).lineWidth(0.8).strokeColor(C.suave).stroke();
  doc.fillColor(C.texto).font('Helvetica-Bold').fontSize(10.5).text(nombre, x, y + 7, { width: 300 });
  if (especialidad) doc.fillColor(C.suave).font('Helvetica').fontSize(9.5).text(especialidad, x, doc.y + 1, { width: 300 });
  doc.fillColor(C.tenue).font('Helvetica').fontSize(8).text('Profesional tratante', x, doc.y + 2, { width: 300 });
  doc.x = MARGEN;
}

function piesDePagina(doc, { encabezadoCorto }) {
  const generado = new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i += 1) {
    doc.switchToPage(i);
    const margenOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const x = MARGEN;
    const ancho = anchoUtil(doc);
    const yLinea = doc.page.height - MARGEN - 12;
    doc.moveTo(x, yLinea).lineTo(x + ancho, yLinea).lineWidth(0.5).strokeColor(C.borde).stroke();
    doc.fillColor(C.tenue).font('Helvetica').fontSize(7.5)
      .text(`Documento confidencial · Generado por DITASH Human+ el ${generado}`, x, yLinea + 7, {
        width: ancho * 0.8,
        lineBreak: false,
      });
    doc.fillColor(C.suave).font('Helvetica-Bold').fontSize(7.5)
      .text(`Página ${i - rango.start + 1} de ${rango.count}`, x, yLinea + 7, { width: ancho, align: 'right', lineBreak: false });

    // Encabezado breve en las páginas 2 en adelante, para que una hoja
    // suelta siga identificando a qué paciente y documento pertenece.
    if (i > rango.start && encabezadoCorto) {
      doc.fillColor(C.tenue).font('Helvetica').fontSize(7.5)
        .text(encabezadoCorto, x, MARGEN - 26, { width: ancho, align: 'right', lineBreak: false });
      doc.moveTo(x, MARGEN - 14).lineTo(x + ancho, MARGEN - 14).lineWidth(0.5).strokeColor(C.borde).stroke();
    }

    doc.page.margins.bottom = margenOriginal;
  }
}

function aBuffer(doc, dibujar) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      dibujar();
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ---------- documentos ----------

// PDF de UNA historia clínica (una cita).
function generarHistoriaClinicaPdf({ paciente, especialistaNombre, especialidad, citaFecha, historia }) {
  const doc = crearDocumento(`Historia clínica ${registro(historia.id)} - ${paciente}`);
  return aBuffer(doc, () => {
    encabezado(doc, {
      titulo: 'Historia Clínica',
      subtitulo: 'Nota de sesión',
      detalle: `Registro N.º ${registro(historia.id)}`,
    });

    aviso(doc, 'DOCUMENTO CONFIDENCIAL — Uso exclusivo del profesional tratante y del paciente. Contiene información de salud protegida; prohibida su divulgación a terceros sin autorización.');

    if (historia.estado === 'anulada') {
      aviso(doc, `NOTA ANULADA POR CORRECCIÓN ADMINISTRATIVA el ${fechaCorta(historia.anulada_en)}. Motivo: ${historia.anulada_motivo || 'no especificado'}.`);
    }

    tituloBloque(doc, 'Datos de la atención');
    const proxima = fechaSoloDia(historia.proxima_cita_recomendada);
    tablaDatos(doc, [
      [['Paciente', paciente], ['Fecha de la sesión', fechaLarga(citaFecha)]],
      [['Profesional', especialistaNombre], ['Especialidad', especialidad || '—']],
      [['Estado de la nota', estadoNota(historia)], ['Próxima cita recomendada', proxima ? fechaCorta(proxima) : 'No registrada']],
    ]);

    SECCIONES.forEach(([campo, titulo]) => seccion(doc, titulo, historia[campo]));
    etiquetaRiesgo(doc, historia.nivel_riesgo);
    bloqueFirma(doc, especialistaNombre, especialidad);

    piesDePagina(doc, { encabezadoCorto: `Historia clínica ${registro(historia.id)} · ${paciente}` });
  });
}

// Historial consolidado: TODAS las sesiones finalizadas de un paciente con
// un mismo especialista, en orden cronológico (el llamador ya filtra solo
// 'finalizada' — nunca borradores ni notas anuladas).
function generarHistoriaClinicaConsolidadaPdf({ paciente, especialistaNombre, especialidad, sesiones }) {
  const doc = crearDocumento(`Historial clínico - ${paciente}`);
  return aBuffer(doc, () => {
    encabezado(doc, {
      titulo: 'Historial Clínico',
      subtitulo: 'Consolidado de sesiones finalizadas',
      detalle: `${sesiones.length} ${sesiones.length === 1 ? 'sesión' : 'sesiones'}`,
    });

    aviso(doc, 'DOCUMENTO CONFIDENCIAL — Uso exclusivo del profesional tratante y del paciente. Reúne información de salud protegida de varias sesiones; prohibida su divulgación a terceros sin autorización.');

    const primera = sesiones[0]?.Cita?.fecha_hora;
    const ultima = sesiones[sesiones.length - 1]?.Cita?.fecha_hora;
    tituloBloque(doc, 'Datos del paciente');
    tablaDatos(doc, [
      [['Paciente', paciente], ['Sesiones incluidas', String(sesiones.length)]],
      [['Profesional', especialistaNombre], ['Especialidad', especialidad || '—']],
      [['Primera sesión', fechaCorta(primera)], ['Última sesión', fechaCorta(ultima)]],
    ]);

    sesiones.forEach((hc, idx) => {
      // Barra de título de cada sesión (con su fecha y registro), siempre
      // acompañada de espacio suficiente para empezar su contenido.
      asegurarEspacio(doc, 110);
      const x = MARGEN;
      const ancho = anchoUtil(doc);
      const y = doc.y;
      doc.roundedRect(x, y, ancho, 28, 5).fill(C.primarioClaro);
      doc.rect(x, y, 4, 28).fill(C.primario);
      doc.fillColor(C.primarioOscuro).font('Helvetica-Bold').fontSize(10.5)
        .text(`Sesión ${idx + 1} de ${sesiones.length} · ${fechaLarga(hc.Cita?.fecha_hora)}`, x + 14, y + 9, { width: ancho * 0.7, lineBreak: false });
      doc.fillColor(C.suave).font('Helvetica').fontSize(8.5)
        .text(`Registro ${registro(hc.id)}`, x, y + 10, { width: ancho - 12, align: 'right', lineBreak: false });
      doc.x = MARGEN;
      doc.y = y + 28 + 16;

      SECCIONES.forEach(([campo, titulo]) => seccion(doc, titulo, hc[campo], { omitirVacia: true }));
      etiquetaRiesgo(doc, hc.nivel_riesgo);
      const proxima = fechaSoloDia(hc.proxima_cita_recomendada);
      if (proxima) {
        doc.fillColor(C.suave).font('Helvetica').fontSize(9)
          .text(`Próxima cita recomendada: ${fechaCorta(proxima)}`, MARGEN + 10, doc.y - 8, { width: anchoUtil(doc) - 10 });
        doc.y += 10;
      }
      doc.y += 8;
    });

    bloqueFirma(doc, especialistaNombre, especialidad);
    piesDePagina(doc, { encabezadoCorto: `Historial clínico consolidado · ${paciente}` });
  });
}

module.exports = { generarHistoriaClinicaPdf, generarHistoriaClinicaConsolidadaPdf };
