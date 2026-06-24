const { query } = require('../../shared/utils/db');

const DepartmentRepository = {
  async findAll() {
    const sql = `
      SELECT department_id, department_name
      FROM   departments
      ORDER  BY department_id
    `;
    const result = await query(sql);
    return result.rows;
  },

  async findById(id) {
    const sql = `
      SELECT department_id, department_name
      FROM   departments
      WHERE  department_id = :id
    `;
    const result = await query(sql, { id });
    return result.rows[0] || null;
  },

  async create(data) {
    const sql = `
      INSERT INTO departments (department_id, department_name)
      VALUES (dept_seq.NEXTVAL, :department_name)
      RETURNING department_id INTO :out_id
    `;
    const binds = {
      department_name: data.department_name.trim(),
      out_id: { dir: require('oracledb').BIND_OUT, type: require('oracledb').NUMBER },
    };
    const result = await query(sql, binds);
    const newId  = result.outBinds.out_id[0];
    return this.findById(newId);
  },

  async update(id, data) {
    const sql = `
      UPDATE departments
      SET    department_name = :department_name
      WHERE  department_id   = :id
    `;
    const result = await query(sql, {
      department_name: data.department_name.trim(),
      id,
    });
    if (result.rowsAffected === 0) return null;
    return this.findById(id);
  },

  async remove(id) {
    const sql = `
      DELETE FROM departments
      WHERE  department_id = :id
    `;
    const result = await query(sql, { id });
    return result.rowsAffected > 0;
  },
};

module.exports = DepartmentRepository;