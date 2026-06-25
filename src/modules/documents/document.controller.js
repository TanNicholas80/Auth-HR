const DocumentService = require('./document.service');
const response         = require('../../shared/utils/response');

const DocumentController = {

  // POST /documents/upload — single file
  async uploadSingle(req, res, next) {
    try {
      // req.user.sub diambil dari jwt token, jadi ga usah kirim param userid di req.body
      const userId = req.user?.sub || Number(req.body.userId);

      const data = await DocumentService.uploadDocument(userId, req.file);
      response.success(res, data, 'File berhasil diupload', 201);
    } catch (e) { next(e); }
  },

  // POST /documents/upload-multiple file
  async uploadMultiple(req, res, next) {
    try {
      const userId = req.user?.sub || Number(req.body.userId);

      const data = await DocumentService.uploadMultiple(userId, req.files);
      response.success(res, data, `${data.length} file berhasil diupload`, 201);
    } catch (e) { next(e); }
  },

  // GET /documents/user/:userId
  async getByUser(req, res, next) {
    try {
      const data = await DocumentService.getUserDocuments(Number(req.params.userId));
      response.success(res, data, 'List dokumen berhasil diambil');
    } catch (e) { next(e); }
  },

  // GET /documents/:id
  async getOne(req, res, next) {
    try {
      const data = await DocumentService.getById(Number(req.params.id));
      response.success(res, data, 'Detail dokumen berhasil diambil');
    } catch (e) { next(e); }
  },

  // DELETE /documents/:id
  async destroy(req, res, next) {
    try {
      const userId = req.user?.sub || Number(req.body.userId);
      const data    = await DocumentService.deleteDocument(Number(req.params.id), userId);
      response.success(res, data, 'Dokumen berhasil dihapus');
    } catch (e) { next(e); }
  },
};

module.exports = DocumentController;