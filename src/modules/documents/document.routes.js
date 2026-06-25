const express = require('express');
const authenticate  = require('../../shared/middlewares/authenticate');
const ctrl = require('./document.controller');
const { upload, handleMulterError } = require('../../shared/middlewares/upload');

const router = express.Router();

/**
 * @route  POST /documents/upload
 * @desc   Upload satu file dokumen
 * @body   multipart/form-data — field name: 'file', plus 'userId' kalau tanpa auth middleware
 */
router.post('/upload',authenticate,upload.single('file'),handleMulterError,ctrl.uploadSingle);

/**
 * @route  POST /documents/upload-multiple
 * @desc   Upload banyak file sekaligus (maks 5 file)
 * @body   multipart/form-data — field name: 'files' (array)
 */
router.post('/upload-multiple',authenticate,upload.array('files', 5),handleMulterError,ctrl.uploadMultiple);

/**
 * @route  GET /documents/user/:userId
 * @desc   Ambil semua dokumen milik satu user (relasi 1:N)
 */
router.get('/user/:userId',authenticate, ctrl.getByUser);

/**
 * @route  GET /documents/:id
 * @desc   Detail satu dokumen
 */
router.get('/:id', authenticate,ctrl.getOne);

/**
 * @route  DELETE /documents/:id
 * @desc   Hapus dokumen (dari storage + database)
 */
router.delete('/:id', authenticate,ctrl.destroy);

module.exports = router;