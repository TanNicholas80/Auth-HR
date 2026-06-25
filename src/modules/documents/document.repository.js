const oracledb = require('oracledb');
const { query } = require('../../shared/utils/db');

const DocumentRepository = {

  // insert ke table user_documents
  async create({userId,fileName,storedFileName,fileLink,filePath,fileSize,contentType,}) {
    const sql = `
      INSERT INTO user_documents (
        usdoc_id, user_id, file_name, stored_file_name,
        file_link, file_path, file_size, content_type, create_date
      ) VALUES (
        seq_user_documents.NEXTVAL, :userId, :fileName, :storedFileName,
        :fileLink, :filePath, :fileSize, :contentType, SYSTIMESTAMP
      )
      RETURNING usdoc_id INTO :out_id
    `;

    const binds = {
      userId,
      fileName,
      storedFileName,
      fileLink,
      filePath,
      fileSize,
      contentType,
      out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    };

    const result = await query(sql, binds);
    const newId = result.outBinds.out_id[0];

    return this.findById(newId);
  },

  async findById(usdocId) {
    const result = await query(
      `SELECT usdoc_id, user_id, file_name, stored_file_name,
              file_link, file_path, file_size, content_type, create_date
       FROM   user_documents
       WHERE  usdoc_id = :usdocId`,
      { usdocId }
    );
    return result.rows[0] || null;
  },

  /**
   * fetch all documents with :user_id
   */
  async findByUserId(userId) {
    const result = await query(
      `SELECT usdoc_id, user_id, file_name, stored_file_name,
              file_link, file_path, file_size, content_type, create_date
       FROM   user_documents
       WHERE  user_id = :userId
       ORDER  BY create_date DESC`,
      { userId }
    );
    return result.rows;
  },

  async remove(usdocId) {
    const result = await query(
      `DELETE FROM user_documents WHERE usdoc_id = :usdocId`,
      { usdocId }
    );
    return result.rowsAffected > 0;
  },
};

module.exports = DocumentRepository;