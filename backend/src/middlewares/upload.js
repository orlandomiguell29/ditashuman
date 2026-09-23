const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');

// Lista blanca estricta de tipos MIME permitidos para el expediente digital.
// Nunca se confía en la extensión del archivo ni en el Content-Type que
// envía el cliente sin verificarlo contra esta lista (mitiga subida de
// ejecutables/scripts disfrazados de documento).
const MIME_PERMITIDOS = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, env.UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Nombre de archivo generado por el servidor (nunca el nombre original del
    // cliente), evitando path traversal ("../../etc/passwd") y colisiones.
    const ext = MIME_PERMITIDOS[file.mimetype] || path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!MIME_PERMITIDOS[file.mimetype]) {
    return cb(new Error('Tipo de archivo no permitido. Solo se aceptan PDF, PNG o JPG.'));
  }
  return cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

module.exports = { upload, MIME_PERMITIDOS };
