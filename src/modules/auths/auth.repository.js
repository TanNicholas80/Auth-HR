const oracledb = require('oracledb');
const { query } = require('../../shared/utils/db');

const AuthRepository = {

  // ── USER ──────────────────────────────────────────────────

  async findByEmail(email) {
    const r = await query(
      `SELECT user_id, username, email, password_hash, full_name,
              is_active, is_email_verified, failed_attempts, locked_until,
              password_reset_token, password_reset_expires
       FROM   users
       WHERE  email      = :email
         AND  deleted_at IS NULL`,
      { email }
    );
    return r.rows[0] || null;
  },

  async findByUsername(username) {
    const r = await query(
      `SELECT user_id, username, email, password_hash, full_name,
              is_active, is_email_verified, failed_attempts, locked_until
       FROM   users
       WHERE  username   = :username
         AND  deleted_at IS NULL`,
      { username }
    );
    return r.rows[0] || null;
  },

  async findUserById(userId) {
    const r = await query(
      `SELECT user_id, username, email, full_name, is_active, created_at
       FROM   users
       WHERE  user_id    = :userId
         AND  deleted_at IS NULL`,
      { userId }
    );
    return r.rows[0] || null;
  },

  async createUser({ username, email, passwordHash, fullName }) {
    const r = await query(
      `INSERT INTO users (user_id, username, email, password_hash, full_name)
       VALUES (seq_users.NEXTVAL, :username, :email, :passwordHash, :fullName)
       RETURNING user_id INTO :out_id`,
      {
        username, email, passwordHash, fullName,
        out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    return r.outBinds.out_id[0];
  },

  async activateUser(userId) {
    await query(
      `UPDATE users
       SET    is_active = 1, is_email_verified = 1, email_verified_at = SYSTIMESTAMP
       WHERE  user_id   = :userId`,
      { userId }
    );
  },

  async incrementFailedAttempts(userId, lockoutAt) {
    // lockoutAt — TIMESTAMP string jika perlu lock, null jika belum
    if (lockoutAt) {
      await query(
        `UPDATE users
         SET    failed_attempts = failed_attempts + 1,
                locked_until    = :lockoutAt
         WHERE  user_id         = :userId`,
        { userId, lockoutAt }
      );
    } else {
      await query(
        `UPDATE users
         SET    failed_attempts = failed_attempts + 1
         WHERE  user_id         = :userId`,
        { userId }
      );
    }
  },

  async resetFailedAttempts(userId, ipAddress) {
    await query(
      `UPDATE users
       SET    failed_attempts = 0,
              locked_until    = NULL,
              last_login_at   = SYSTIMESTAMP,
              last_login_ip   = :ipAddress
       WHERE  user_id         = :userId`,
      { userId, ipAddress }
    );
  },

  // ── ROLES & PERMISSIONS — untuk JWT payload ───────────────

  async assignDefaultRole(userId) {
    // Assign role USER (default) saat signup
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT :userId, role_id
       FROM   roles
       WHERE  role_code = 'USER'
         AND  is_active = 1`,
      { userId }
    );
  },

  /**
   * Ambil roles dan permissions user — untuk build JWT payload dan response login
   */
  async getUserRolesAndPermissions(userId) {
    // Roles
    const rolesResult = await query(
      `SELECT r.role_id, r.role_code, r.role_name
       FROM   user_roles ur
       JOIN   roles      r ON r.role_id   = ur.role_id
                           AND r.is_active = 1
       WHERE  ur.user_id   = :userId
         AND  (ur.expires_at IS NULL OR ur.expires_at > SYSTIMESTAMP)`,
      { userId }
    );

    // Permissions — union dari role + direct grant
    const permsResult = await query(
      `SELECT DISTINCT permission_id, permission_code, module, action
       FROM (
         SELECT p.permission_id, p.permission_code, p.module, p.action
         FROM   user_roles      ur
         JOIN   role_permissions rp ON rp.role_id       = ur.role_id
         JOIN   permissions      p  ON p.permission_id = rp.permission_id
         JOIN   roles             r  ON r.role_id        = ur.role_id
                                     AND r.is_active     = 1
         WHERE  ur.user_id = :userId
           AND  (ur.expires_at IS NULL OR ur.expires_at > SYSTIMESTAMP)

         UNION

         SELECT p.permission_id, p.permission_code, p.module, p.action
         FROM   user_permissions up
         JOIN   permissions      p ON p.permission_id = up.permission_id
         WHERE  up.user_id = :userId
       )`,
      { userId }
    );

    return {
      roles:       rolesResult.rows,
      permissions: permsResult.rows,
    };
  },

  // ── AUTHORIZATION — role grants & module permissions ─────

  async findAllActiveRoles() {
    const r = await query(
      `SELECT role_id, role_code, role_name
       FROM   roles
       WHERE  is_active = 1
       ORDER  BY role_name`,
      {}
    );
    return r.rows;
  },

  async findAssignedRoles(userId) {
    const r = await query(
      `SELECT r.role_id, r.role_code, r.role_name
       FROM   user_roles ur
       JOIN   roles      r ON r.role_id   = ur.role_id
                           AND r.is_active = 1
       WHERE  ur.user_id   = :userId
         AND  (ur.expires_at IS NULL OR ur.expires_at > SYSTIMESTAMP)
       ORDER  BY r.role_name`,
      { userId }
    );
    return r.rows;
  },

  async findRolesByIds(roleIds) {
    if (!roleIds.length) return [];
    const r = await query(
      `SELECT role_id, role_code, role_name
       FROM   roles
       WHERE  is_active = 1
         AND  role_id IN (${roleIds.map((_, i) => `:id${i}`).join(', ')})`,
      Object.fromEntries(roleIds.map((id, i) => [`id${i}`, id]))
    );
    return r.rows;
  },

  async syncUserRoles(userId, roleIds, assignedBy) {
    const current = await this.findAssignedRoles(userId);
    const currentIds = current.map((r) => r.ROLE_ID);
    const targetSet = new Set(roleIds);
    const toRemove = currentIds.filter((id) => !targetSet.has(id));
    const toAdd    = roleIds.filter((id) => !currentIds.includes(id));

    for (const roleId of toRemove) {
      await query(
        `DELETE FROM user_roles WHERE user_id = :userId AND role_id = :roleId`,
        { userId, roleId }
      );
    }

    for (const roleId of toAdd) {
      await query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by)
         VALUES (:userId, :roleId, :assignedBy)`,
        { userId, roleId, assignedBy: assignedBy || null }
      );
    }

    return { toAdd, toRemove };
  },

  async findDistinctModules() {
    const r = await query(
      `SELECT DISTINCT module FROM permissions ORDER BY module`,
      {}
    );
    return r.rows.map((row) => row.MODULE);
  },

  async findPermissionsByModule(module) {
    const r = await query(
      `SELECT permission_id, action, permission_code, module
       FROM   permissions
       WHERE  module = :module
       ORDER  BY action`,
      { module }
    );
    return r.rows;
  },

  async findDirectPermissions(userId, module) {
    const r = await query(
      `SELECT p.permission_id, p.action, p.permission_code, p.module
       FROM   user_permissions up
       JOIN   permissions      p ON p.permission_id = up.permission_id
       WHERE  up.user_id = :userId
         AND  p.module   = :module
       ORDER  BY p.action`,
      { userId, module }
    );
    return r.rows;
  },

  async findPermissionsByIds(permissionIds) {
    if (!permissionIds.length) return [];
    const r = await query(
      `SELECT permission_id, action, permission_code, module
       FROM   permissions
       WHERE  permission_id IN (${permissionIds.map((_, i) => `:id${i}`).join(', ')})`,
      Object.fromEntries(permissionIds.map((id, i) => [`id${i}`, id]))
    );
    return r.rows;
  },

  async syncUserPermissions(userId, module, permissionIds, grantedBy) {
    const current = await this.findDirectPermissions(userId, module);
    const currentIds = current.map((p) => p.PERMISSION_ID);
    const targetSet = new Set(permissionIds);
    const toRemove = currentIds.filter((id) => !targetSet.has(id));
    const toAdd    = permissionIds.filter((id) => !currentIds.includes(id));

    for (const permissionId of toRemove) {
      await query(
        `DELETE FROM user_permissions
         WHERE user_id = :userId AND permission_id = :permissionId`,
        { userId, permissionId }
      );
    }

    for (const permissionId of toAdd) {
      await query(
        `INSERT INTO user_permissions (user_id, permission_id, granted_by)
         VALUES (:userId, :permissionId, :grantedBy)`,
        { userId, permissionId, grantedBy: grantedBy || null }
      );
    }

    return { toAdd, toRemove };
  },

  // ── TOKENS ────────────────────────────────────────────────

  async saveToken({ userId, tokenType, tokenValue, expiresAt, deviceInfo, ipAddress }) {
    await query(
      `INSERT INTO user_tokens (token_id, user_id, token_type, token_value, expires_at, device_info, ip_address)
       VALUES (seq_user_tokens.NEXTVAL, :userId, :tokenType, :tokenValue, :expiresAt, :deviceInfo, :ipAddress)`,
      { userId, tokenType, tokenValue, expiresAt, deviceInfo: deviceInfo || null, ipAddress: ipAddress || null }
    );
  },

  async findRefreshToken(tokenValue) {
    const r = await query(
      `SELECT token_id, user_id, expires_at
       FROM   user_tokens
       WHERE  token_value = :tokenValue
         AND  token_type  = 'REFRESH'
         AND  is_revoked  = 0
         AND  expires_at  > SYSTIMESTAMP`,
      { tokenValue }
    );
    return r.rows[0] || null;
  },

  async revokeAllUserTokens(userId, revokedBy = 'LOGOUT') {
    await query(
      `UPDATE user_tokens
       SET    is_revoked = 1, revoked_at = SYSTIMESTAMP, revoked_by = :revokedBy
       WHERE  user_id    = :userId AND is_revoked = 0`,
      { userId, revokedBy }
    );
  },

  async revokeToken(tokenValue, revokedBy = 'LOGOUT') {
    await query(
      `UPDATE user_tokens
       SET    is_revoked = 1, revoked_at = SYSTIMESTAMP, revoked_by = :revokedBy
       WHERE  token_value = :tokenValue`,
      { tokenValue, revokedBy }
    );
  },

  // ── OTP ───────────────────────────────────────────────────

  async createOtp({ userId, otpHash, purpose, expiresAt }) {
    // Invalidate OTP lama dengan purpose yang sama
    await query(
      `UPDATE otp_codes SET is_used = 1
       WHERE  user_id  = :userId AND purpose = :purpose AND is_used = 0`,
      { userId, purpose }
    );

    await query(
      `INSERT INTO otp_codes (otp_id, user_id, otp_hash, purpose, expires_at)
       VALUES (seq_otp_codes.NEXTVAL, :userId, :otpHash, :purpose, :expiresAt)`,
      { userId, otpHash, purpose, expiresAt }
    );
  },

  async findActiveOtp(userId, purpose) {
    const r = await query(
      `SELECT *
       FROM (
         SELECT otp_id, otp_hash, attempts, max_attempts, expires_at
         FROM   otp_codes
         WHERE  user_id    = :userId
           AND  purpose    = :purpose
           AND  is_used    = 0
           AND  expires_at > SYSTIMESTAMP
           AND  attempts   < max_attempts
         ORDER  BY created_at DESC
       )
       WHERE ROWNUM = 1`,
      { userId, purpose }
    );
    return r.rows[0] || null;
  },

  async incrementOtpAttempts(otpId) {
    await query(
      `UPDATE otp_codes SET attempts = attempts + 1 WHERE otp_id = :otpId`,
      { otpId }
    );
  },

  async markOtpUsed(otpId) {
    await query(
      `UPDATE otp_codes SET is_used = 1, used_at = SYSTIMESTAMP WHERE otp_id = :otpId`,
      { otpId }
    );
  },

  // ── AUDIT ─────────────────────────────────────────────────

  async createAuditLog({ userId, action, status, ipAddress, userAgent, detail }) {
    await query(
      `INSERT INTO audit_logs (log_id, user_id, action, status, ip_address, user_agent, detail)
       VALUES (seq_audit_logs.NEXTVAL, :userId, :action, :status, :ipAddress, :userAgent, :detail)`,
      {
        userId:    userId    || null,
        action,
        status,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        detail:    detail    || null,
      }
    );
  },

  // ── PASSWORD RESET ─────────────────────────────────────────
  async createPasswordResetToken({ userId, token, expiresAt }) {
    await query(
      `UPDATE users
       SET    password_reset_token   = :token,
              password_reset_expires = :expiresAt,
              updated_at             = SYSTIMESTAMP
       WHERE  user_id = :userId`,
      { userId, token, expiresAt }
    );
  },

  async findByPasswordResetToken(token) {
    const r = await query(
      `SELECT user_id, username, email, password_reset_expires
       FROM   users
       WHERE  password_reset_token   = :token
         AND  password_reset_expires > SYSTIMESTAMP
         AND  deleted_at IS NULL`,
      { token }
    );
    return r.rows[0] || null;
  },

  async updatePassword(userId, passwordHash) {
    await query(
      `UPDATE users
       SET    password_hash          = :passwordHash,
              password_reset_token   = NULL,
              password_reset_expires = NULL,
              failed_attempts        = 0,
              locked_until           = NULL,
              updated_at             = SYSTIMESTAMP
       WHERE  user_id = :userId`,
      { userId, passwordHash }
    );
  },
};

module.exports = AuthRepository;
