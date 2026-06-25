// Strategy pattern: upload ke Cloudinary (cloud storage + CDN)
// Cocok untuk: production, multi-instance deployment, butuh CDN
// File tetap bisa diakses meski container di-restart atau di-scale

const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const config      = require('../../../../config');
const AppError    = require('../../../shared/utils/AppError');

// ── Konfigurasi sekali saat module di-load ─────────────────
cloudinary.config({
  cloud_name: config.storage.cloudinary.cloudName,
  api_key:    config.storage.cloudinary.apiKey,
  api_secret: config.storage.cloudinary.apiSecret,
});

const cloudinaryStorageProvider = {
  /**
   * Upload file buffer ke Cloudinary via upload_stream
   * @param {object} file - { originalname, mimetype, size, buffer } dari multer
   * @returns {{ storedFileName, filePath, fileLink }}
   */
  async upload(file) {
    const storedFileName = `${uuidv4()}-${file.originalname}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder:        config.storage.cloudinary.folder,
          public_id:      storedFileName.replace(/\.[^/.]+$/, ''), // ga pake file extensions
          resource_type: 'auto', // otomatis deteksi image/pdf/raw
        },
        (err, result) => {
          if (err) {
            return reject(new AppError(`Gagal upload ke Cloudinary: ${err.message}`, 502));
          }

          resolve({
            storedFileName,
            // filePath untuk Cloudinary = public_id, dipakai saat mau hapus
            filePath: result.public_id,
            fileLink: result.secure_url,
          });
        }
      );

      // Kirim buffer ke stream Cloudinary
      uploadStream.end(file.buffer);
    });
  },

  /**
   * Hapus file dari Cloudinary — dipanggil saat user_documents row dihapus
   * @param {string} publicId - disimpan di kolom file_path
   */
  async remove(publicId) {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
    } catch (err) {
      console.warn(`Gagal hapus file Cloudinary: ${publicId}`, err.message);
    }
  },
};

module.exports = cloudinaryStorageProvider;