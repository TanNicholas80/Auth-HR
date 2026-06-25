// simpan file ke disk lokal server (folder /uploads)
// di local cocok jika masih tahap development, single-server deployment, atau internal tool
// Kurang cocok untuk: multi-instance deployment (jika pod docker > 1)

const fs        = require('fs/promises');
const path      = require('path');
const { v4: uuidv4 } = require('uuid');
const config    = require('../../../../config');
const AppError  = require('../../../shared/utils/AppError');

const UPLOAD_DIR = path.resolve(process.cwd(), config.storage.local.uploadDir);

/**
 * Pastikan folder uploads ada sebelum nulis file
 */
const ensureUploadDir = async () => {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
};

const localStorageProvider = {
  /**
   * Upload file buffer ke local disk
   * @param {object} file - { originalname, mimetype, size, buffer } dari multer
   * @returns {{ storedFileName, filePath, fileLink }}
   */
  async upload(file) {
    await ensureUploadDir();

    // Generate nama file unik — hindari collision & path traversal attack
    const ext             = path.extname(file.originalname);
    const storedFileName  = `${uuidv4()}${ext}`;
    const filePath        = path.join(UPLOAD_DIR, storedFileName);

    try {
      await fs.writeFile(filePath, file.buffer);
    } catch (err) {
      throw new AppError('Gagal menyimpan file ke local storage', 500);
    }

    return {
      storedFileName,
      // filePath disimpan path RELATIF (bukan absolute), supaya portable
      filePath: path.join(config.storage.local.uploadDir, storedFileName),
      fileLink: `${config.storage.local.baseUrl}/${config.storage.local.uploadDir}/${storedFileName}`,
    };
  },

  /**
   * Hapus file dari local disk — dipanggil saat user_documents row dihapus
   */
  async remove(filePath) {
    try {
      const fullPath = path.resolve(process.cwd(), filePath);
      await fs.unlink(fullPath);
    } catch (err) {
      // File mungkin sudah tidak ada — ga usah di throw, cukup buat log
      console.warn(`Gagal hapus file local: ${filePath}`, err.message);
    }
  },
};

module.exports = localStorageProvider;