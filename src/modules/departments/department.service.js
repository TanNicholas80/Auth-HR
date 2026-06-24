const DepartmentRepository = require('./department.repository');
const DepartmentModel      = require('./department.model');
const AppError             = require('../../shared/utils/AppError');

const DepartmentService = {
  async getAll() {
    return DepartmentRepository.findAll();
  },

  async getById(id) {
    const dept = await DepartmentRepository.findById(id);
    if (!dept) throw new AppError(`Department dengan ID ${id} tidak ditemukan`, 404);
    return dept;
  },

  async create(data) {
    const { valid, errors } = DepartmentModel.validate(data);
    if (!valid) throw new AppError('Validasi gagal', 422, errors);

    return DepartmentRepository.create(data);
  },

  async update(id, data) {
    await this.getById(id);

    const { valid, errors } = DepartmentModel.validate(data);
    if (!valid) throw new AppError('Validasi gagal', 422, errors);

    return DepartmentRepository.update(id, data);
  },

  async remove(id) {
    await this.getById(id);
    const deleted = await DepartmentRepository.remove(id);
    if (!deleted) throw new AppError('Gagal menghapus department', 500);
    return { department_id: id };
  },
};

module.exports = DepartmentService;