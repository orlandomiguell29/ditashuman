const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

// Logo oficial de DITASH Human+ (isotipo + wordmark completo, PNG con fondo
// transparente), embebido en el certificado. Se resuelve una sola vez al
// cargar el módulo y se valida su existencia antes de dibujarlo: si el
// archivo llegara a faltar (por ejemplo, un despliegue que no copió
// `backend/assets/`), el certificado debe seguir generándose igual, solo
// que sin el logo, en vez de reventar la descarga completa.
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo-certificado.png');
const LOGO_DISPONIBLE = fs.existsSync(LOGO_PATH);
// Proporción real del PNG (723x701): se usa para escalar sin deformar el
// logo, sea cual sea el ancho que se le pida más abajo.
const LOGO_RATIO_ALTO_ANCHO = 701 / 723;

// Genera un código de verificación determinístico a partir de datos que no
// cambian (inscripción, colaborador, curso, fecha de finalización) más un
// "pepper" del servidor (JWT_ACCESS_SECRET) para que no pueda recalcularse
// fuera del backend. No es un secreto por-usuario: solo permite confirmar
// que un PDF impreso/descargado corresponde a un registro real del sistema.
function codigoVerificacion({ inscripcionId, colaboradorId, cursoId, fechaFin }) {
  const env = require('../config/env');
  const base = `${inscripcionId}:${colaboradorId}:${cursoId}:${new Date(fechaFin).toISOString()}:${env.JWT_ACCESS_SECRET}`;
  return crypto.createHash('sha256').update(base).digest('hex').slice(0, 16).toUpperCase();
}

// Construye el PDF del certificado en memoria (Buffer) y lo retorna; no se
// persiste en disco — se regenera bajo demanda a partir de los datos ya
// almacenados en la base de datos, así siempre refleja el estado real.
function generarCertificadoPdf({ nombreColaborador, tituloCurso, duracionHoras, fechaFin, inscripcionId, colaboradorId, cursoId }) {
  return new Promise((resolve, reject) => {
    try {
      // OJO con `margin`: PDFKit usa el margen para decidir cuándo debe
      // auto-paginar un `.text()` que "no cabe" dentro del área imprimible.
      // Aquí TODO el contenido se posiciona a mano con coordenadas
      // absolutas (x, y) pensadas para la hoja completa — con `margin: 50`,
      // cualquier texto colocado por debajo de `alto - 50` (como el código
      // de verificación, pegado al borde inferior) queda "fuera del margen"
      // para PDFKit, que entonces agregaba automáticamente una SEGUNDA
      // página en blanco para "seguir escribiendo" ahí. Se pone `margin: 0`
      // porque no se usa el flujo automático de PDFKit en ningún momento:
      // así el certificado siempre tiene una sola página.
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const codigo = codigoVerificacion({ inscripcionId, colaboradorId, cursoId, fechaFin });
      const ancho = doc.page.width;
      const alto = doc.page.height;

      // Paleta clara y moderna, ahora con el cuerpo completo CENTRADO en la
      // página (antes todo el texto arrancaba pegado al margen izquierdo,
      // lo que se veía desbalanceado en una hoja tan ancha como el
      // landscape). El acento de color pasa de una franja lateral a una
      // barra superior horizontal, para no "jalar" la composición hacia la
      // izquierda y dejar el centrado limpio.
      const FONDO = '#ffffff';
      const FRANJA = '#1d4ed8';
      const FRANJA_CLARA = '#60a5fa';
      const TEXTO_PRINCIPAL = '#0f172a';
      const TEXTO_SUAVE = '#475569';
      const TEXTO_TENUE = '#94a3b8';

      doc.rect(0, 0, ancho, alto).fill(FONDO);

      // Barra superior a dos tonos, centrada: único elemento de color
      // fuerte del diseño (reemplaza el doble marco de diploma clásico).
      doc.rect(0, 0, ancho, 10).fill(FRANJA);
      doc.rect(0, 10, ancho, 4).fill(FRANJA_CLARA);

      // Barra inferior, espejo exacto de la superior (mismo orden y
      // grosor de tonos), para que el diseño quede enmarcado arriba y
      // abajo en vez de flotar sin cierre visual en la parte baja.
      doc.rect(0, alto - 14, ancho, 4).fill(FRANJA_CLARA);
      doc.rect(0, alto - 10, ancho, 10).fill(FRANJA);

      const margen = 90;
      const anchoContenido = ancho - margen * 2;
      const centro = { align: 'center', width: anchoContenido };
      const centroX = ancho / 2;

      doc.fillColor(TEXTO_TENUE).font('Helvetica-Bold').fontSize(11)
        .text('DITASH HUMAN+ · PLATAFORMA DE BIENESTAR CORPORATIVO', margen, 60, { ...centro, characterSpacing: 1 });

      doc.fillColor(TEXTO_PRINCIPAL).font('Helvetica-Bold').fontSize(38).text('Certificado de finalización', margen, 104, centro);

      doc.fillColor(TEXTO_SUAVE).font('Helvetica').fontSize(14).text('Se otorga el presente certificado a', margen, 168, centro);

      doc.fillColor(FRANJA).font('Helvetica-Bold').fontSize(30).text(nombreColaborador, margen, 192, centro);

      doc.fillColor(TEXTO_SUAVE).font('Helvetica').fontSize(14)
        .text('por haber completado satisfactoriamente el curso', margen, 238, centro);

      doc.fillColor(TEXTO_PRINCIPAL).font('Helvetica-Bold').fontSize(21).text(tituloCurso, margen, 262, centro);

      const fechaTexto = new Date(fechaFin).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
      doc.fillColor(TEXTO_SUAVE).font('Helvetica').fontSize(12)
        .text(`Duración: ${duracionHoras} horas   ·   Fecha de finalización: ${fechaTexto}`, margen, 300, centro);

      // Sello: el logo oficial completo (isotipo + "DITASH HUMAN"), a un
      // tamaño que se lea bien, centrado en el eje horizontal, con la firma
      // justo debajo. Como el logo YA incluye el nombre de la marca, ya no
      // hace falta repetirlo como texto aparte junto a la firma (ver más
      // abajo). Si por algún motivo el archivo no está disponible, se usa
      // un sello vectorial simple como respaldo (mejor eso que un hueco en
      // blanco en el certificado).
      const firmaAncho = 220;
      const firmaX = centroX - firmaAncho / 2;
      const firmaY = alto - 95;

      if (LOGO_DISPONIBLE) {
        const logoAncho = 150;
        const logoAlto = logoAncho * LOGO_RATIO_ALTO_ANCHO;
        // Apoyado justo encima de la línea de firma, con el mismo espacio
        // libre arriba (hacia el bloque de duración/fecha) que abajo.
        const logoY = firmaY - logoAlto - 20;
        doc.image(LOGO_PATH, centroX - logoAncho / 2, logoY, { width: logoAncho, height: logoAlto });
      } else {
        const selloY = firmaY - 55;
        doc.circle(centroX, selloY, 34).lineWidth(2.5).stroke(FRANJA);
        doc.circle(centroX, selloY, 28).lineWidth(1).stroke(FRANJA_CLARA);
        doc.save();
        doc.lineWidth(3.5).strokeColor(FRANJA).lineCap('round').lineJoin('round');
        doc.moveTo(centroX - 12, selloY + 2).lineTo(centroX - 3, selloY + 11).lineTo(centroX + 14, selloY - 10).stroke();
        doc.restore();
      }

      // Línea de firma centrada (sin nombre de una persona real: la
      // plataforma emite el certificado automáticamente al completar el
      // curso). Antes decía "DITASH Human+" en texto justo debajo, pero eso
      // ya queda cubierto por el logo de arriba — se deja solo la
      // aclaración de que la emisión es automática.
      doc.moveTo(firmaX, firmaY).lineTo(firmaX + firmaAncho, firmaY).lineWidth(1).strokeColor('#cbd5e1').stroke();
      doc.fillColor(TEXTO_TENUE).font('Helvetica').fontSize(10).text('Emisión automática al completar el curso', margen, firmaY + 12, centro);

      doc.fillColor(TEXTO_TENUE).font('Helvetica').fontSize(9).text(
        `Código de verificación: ${codigo}`,
        margen,
        alto - 34,
        centro
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generarCertificadoPdf, codigoVerificacion };
