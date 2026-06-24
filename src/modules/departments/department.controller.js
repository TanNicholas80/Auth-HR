const DepartmentService = require('./department.service');
const response          = require('../../shared/utils/response');

const DepartmentController = {
  async index(req, res, next) {
    try {
      const data = await DepartmentService.getAll();
      return response.success(res, data, 'Daftar department berhasil diambil');
    } catch (err) {
      next(err);
    }
  },

  async show(req, res, next) {
    try {
      const data = await DepartmentService.getById(Number(req.params.id));
      return response.success(res, data, 'Detail department berhasil diambil');
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const data = await DepartmentService.create(req.body);
      return response.success(res, data, 'Department berhasil dibuat', 201);
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const data = await DepartmentService.update(Number(req.params.id), req.body);
      return response.success(res, data, 'Department berhasil diperbarui');
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      const data = await DepartmentService.remove(Number(req.params.id));
      return response.success(res, data, 'Department berhasil dihapus');
    } catch (err) {
      next(err);
    }
  },
};

module.exports = DepartmentController;