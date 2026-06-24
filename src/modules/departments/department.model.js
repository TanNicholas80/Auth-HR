/**
 * Department model — representasi struktur tabel DEPARTMENTS
 * Dipakai untuk validasi dan dokumentasi field.
 */
const DepartmentModel = {
    tableName: 'DEPARTMENTS',
    fields: {
      department_id:   { type: 'NUMBER', primaryKey: true },
      department_name: { type: 'VARCHAR2', required: true, maxLength: 100 },
    },
  
    /**
     * Validasi payload input
     * @param {object} data
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validate(data) {
      const errors = [];
  
      if (!data.department_name || String(data.department_name).trim() === '') {
        errors.push('department_name wajib diisi');
      } else if (String(data.department_name).length > 100) {
        errors.push('department_name maksimal 100 karakter');
      }
  
      return { valid: errors.length === 0, errors };
    },
  };
  
  module.exports = DepartmentModel;