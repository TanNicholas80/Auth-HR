const AppError           = require('../../shared/utils/AppError');
const DocumentRepository = require('./document.repository');
const storageProvider     = require('./providers'); // otomatis local atau cloudinary

const DocumentService = {

  /**
   * Upload satu file dan simpan relasinya ke user_documents
   *
   * @param {number} userId
   * @param {object} file - dari multer: { originalname, mimetype, size, buffer }
   */
  async uploadDocument(userId, file) {
    if (!file) {
      throw new AppError('File tidak ditemukan dalam request', 422);
    }

    // ── 1. Upload fisik file ke storage (local atau cloudinary) ──
    const { storedFileName, filePath, fileLink } = await storageProvider.upload(file);

    // ── 2. Simpan metadata + relasi ke user_documents ────────────
    try {
      const doc = await DocumentRepository.create({
        userId,
        fileName:       file.originalname,
        storedFileName,
        fileLink,
        filePath,
        fileSize:       file.size,
        contentType:    file.mimetype,
      });

      return this._toResponseShape(doc);

    } catch (dbErr) {
      // Rollback manual — kalau insert DB gagal, hapus file yang sudah terupload
      // tujuannya supaya tidak ada file sampah/ orphan tanpa record di database
      await storageProvider.remove(filePath);
      throw dbErr;
    }
  },

  /**
   * Upload multiple file sekaligus untuk satu user
   */
  async uploadMultiple(userId, files) {
    if (!files || files.length === 0) {
      throw new AppError('Tidak ada file untuk diupload', 422);
    }

    const results = [];
    for (const file of files) {
      // Ga usah pake Promise.all dulu spy bisa ditrace errornya
      const doc = await this.uploadDocument(userId, file);
      results.push(doc);
    }
    return results;
  },

  async getUserDocuments(userId) {
    const docs = await DocumentRepository.findByUserId(userId);
    return docs.map(this._toResponseShape);
  },

  async getById(usdocId) {
    const doc = await DocumentRepository.findById(usdocId);
    if (!doc) throw new AppError(`Dokumen ID ${usdocId} tidak ditemukan`, 404);
    return this._toResponseShape(doc);
  },

  /**
   * Hapus dokumen — hapus dari storage dan dari database
   */
  async deleteDocument(usdocId, requestUserId) {
    const doc = await DocumentRepository.findById(usdocId);
    if (!doc) throw new AppError(`Dokumen ID ${usdocId} tidak ditemukan`, 404);

    // simple authorize jika user ga punya akses ke file doc
    if (doc.USER_ID !== requestUserId) {
      throw new AppError('Anda tidak memiliki akses ke dokumen ini', 403);
    }

    await storageProvider.remove(doc.FILE_PATH);
    await DocumentRepository.remove(usdocId);

    return { deleted_id: usdocId };
  },

  // ── Private helper — convert UPPERCASE Oracle ke camelCase ───
  _toResponseShape(doc) {
    return {
      usdocId:        doc.USDOC_ID,
      userId:         doc.USER_ID,
      fileName:       doc.FILE_NAME,
      storedFileName: doc.STORED_FILE_NAME,
      fileLink:       doc.FILE_LINK,
      fileSize:       doc.FILE_SIZE,
      contentType:    doc.CONTENT_TYPE,
      createDate:     doc.CREATE_DATE,
    };
  },
};

module.exports = DocumentService;