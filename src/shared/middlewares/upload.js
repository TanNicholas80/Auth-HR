// Semua file yg diupload akan disimpan di memoryStorage atau req.file.buffer
// LocalStorageProvider maupun CloudinaryStorageProvider akan ambil data dari memory storage req.file.buffer

const multer   = require('multer');
const config   = require('../../../config');
const AppError = require('../utils/AppError');

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new AppError(
        `Tipe file tidak diizinkan: ${file.mimetype}. Hanya JPG, PNG, WEBP, PDF, DOC, DOCX.`,
        422
      )
    );
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.storage.maxFileSizeMb * 1024 * 1024, // MB → bytes
  },
});

/**
 * Middleware error handler khusus multer
 * Multer throw error yang formatnya beda dari AppError biasa
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new AppError(
          `Ukuran file maksimal ${config.storage.maxFileSizeMb}MB`,
          422
        )
      );
    }
    return next(new AppError(`Upload error: ${err.message}`, 422));
  }
  next(err);
};

module.exports = { upload, handleMulterError };