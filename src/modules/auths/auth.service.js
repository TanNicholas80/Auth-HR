const argon2       = require('argon2');
const { v4: uuid } = require('uuid');
const config       = require('../../../config');
const AppError     = require('../../shared/utils/AppError');
const tokenHelper  = require('../../shared/utils/tokenHelper');
const emailService = require('../../shared/utils/emailService');
const AuthRepository = require('./auth.repository');
const authHelper = require('./auth.helper');

const AuthService = {

  // ── 1. SIGNUP ─────────────────────────────────────────────
  async signup({ username, email, password, fullName }, meta = {}) {
    // Validasi duplikat
    const [existEmail, existUsername] = await Promise.all([
      AuthRepository.findByEmail(email),
      AuthRepository.findByUsername(username),
    ]);
    if (existEmail)    throw new AppError('Email sudah terdaftar', 409);
    if (existUsername) throw new AppError('Username sudah dipakai', 409);

    // Hash password
    const passwordHash = await argon2.hash(password, config.argon2);

    // Buat user (is_active = 0, belum verified)
    const userId = await AuthRepository.createUser({
      username, email, passwordHash, fullName,
    });

    // Assign default role USER
    await AuthRepository.assignDefaultRole(userId);

    // Kirim OTP email verify
    const otp     = authHelper.generateOtp();
    const otpHash = await argon2.hash(otp, {
      ...config.argon2, memoryCost: 19456, timeCost: 2,
    });

    await AuthRepository.createOtp({
      userId,
      otpHash,
      purpose:   'EMAIL_VERIFY',
      expiresAt: authHelper.otpExpiresAt(),
    });

    await emailService.sendOtp({ to: email, username, otp, purpose: 'EMAIL_VERIFY' });

    await AuthRepository.createAuditLog({
      userId,
      action:    'REGISTER',
      status:    'SUCCESS',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      detail:    `User ${username} registered`,
    });

    return {
      userId,
      email,
      message: `OTP verifikasi telah dikirim ke ${email}`,
    };
  },

  // ── 2. SEND OTP (resend / keperluan lain) ─────────────────
  async sendOtp({ email, purpose }, meta = {}) {
    const user = await AuthRepository.findByEmail(email);
    if (!user) throw new AppError('Email tidak ditemukan', 404);

    // Jika purpose PASSWORD_RESET, user tidak boleh memiliki password reset token
    if (purpose === 'PASSWORD_RESET' && user.PASSWORD_RESET_TOKEN !== null)
      throw new AppError('Password reset token sudah ada', 400);

    // Kalau purpose EMAIL_VERIFY, user tidak boleh sudah aktif
    if (purpose === 'EMAIL_VERIFY' && user.IS_ACTIVE === 1)
      throw new AppError('Akun sudah terverifikasi', 400);

    const otp     = authHelper.generateOtp();
    const otpHash = await argon2.hash(otp, {
      ...config.argon2, memoryCost: 19456, timeCost: 2,
    });

    await AuthRepository.createOtp({
      userId:    user.USER_ID,
      otpHash,
      purpose,
      expiresAt: authHelper.otpExpiresAt(),
    });

    await emailService.sendOtp({
      to:       user.EMAIL,
      username: user.USERNAME,
      otp,
      purpose,
    });

    return { message: `OTP baru telah dikirim ke ${email}` };
  },

  // ── 3. VERIFY OTP ─────────────────────────────────────────
  async verifyOtp({ email, otp, purpose }, meta = {}) {
    const user = await AuthRepository.findByEmail(email);
    if (!user) throw new AppError('Email tidak ditemukan', 404);

    const otpRecord = await AuthRepository.findActiveOtp(user.USER_ID, purpose);

    if (!otpRecord)
      throw new AppError('OTP tidak valid atau sudah expired. Minta OTP baru.', 400);

    // Cek attempts
    if (otpRecord.ATTEMPTS >= otpRecord.MAX_ATTEMPTS) {
      await AuthRepository.markOtpUsed(otpRecord.OTP_ID);
      throw new AppError('Terlalu banyak percobaan. Minta OTP baru.', 429);
    }

    // Verify OTP
    const valid = await argon2.verify(otpRecord.OTP_HASH, otp);
    if (!valid) {
      await AuthRepository.incrementOtpAttempts(otpRecord.OTP_ID);
      const remaining = otpRecord.MAX_ATTEMPTS - (otpRecord.ATTEMPTS + 1);
      throw new AppError(`OTP salah. Sisa percobaan: ${remaining}`, 400);
    }

    // OTP jika OK
    await AuthRepository.markOtpUsed(otpRecord.OTP_ID);

    // Jika EMAIL_VERIFY → aktifkan user dan langsung return token
    if (purpose === 'EMAIL_VERIFY') {
      await AuthRepository.activateUser(user.USER_ID);

      const { roles, permissions } = await AuthRepository.getUserRolesAndPermissions(user.USER_ID);
      const payload                = authHelper.buildJwtPayload(user, roles, permissions);
      const accessToken            = tokenHelper.signAccess(payload);
      const refreshToken           = uuid();

      // Simpan token
      const decodedAccess = tokenHelper.decode(accessToken);
      await Promise.all([
        AuthRepository.saveToken({
          userId:     user.USER_ID,
          tokenType:  'ACCESS_JWT',
          tokenValue: decodedAccess.jti,
          expiresAt:  new Date(decodedAccess.exp * 1000),
          ipAddress:  meta.ip,
        }),
        AuthRepository.saveToken({
          userId:     user.USER_ID,
          tokenType:  'REFRESH',
          tokenValue: refreshToken,
          expiresAt:  authHelper.refreshExpiresAt(),
          deviceInfo: meta.userAgent,
          ipAddress:  meta.ip,
        }),
      ]);

      await AuthRepository.createAuditLog({
        userId:    user.USER_ID,
        action:    'EMAIL_VERIFY',
        status:    'SUCCESS',
        ipAddress: meta.ip,
        detail:    'Email berhasil diverifikasi',
      });

      return {
        verified: true,
        message:  'Akun berhasil diverifikasi',
        ...authHelper.buildAuthResponse(
          { ...user, IS_ACTIVE: 1 },
          roles, permissions,
          accessToken, refreshToken
        ),
      };
    }

    // Jika PASSWORD_RESET → buat token reset link
    if (purpose === 'PASSWORD_RESET') {
      const resetToken = authHelper.generatePasswordResetToken();
      const expiresAt  = authHelper.passwordResetExpiresAt();

      await AuthRepository.createPasswordResetToken({
        userId:    user.USER_ID,
        token:     resetToken,
        expiresAt,
      });

      await AuthRepository.createAuditLog({
        userId:    user.USER_ID,
        action:    'PASSWORD_RESET',
        status:    'SUCCESS',
        ipAddress: meta.ip,
        detail:    'Password reset token berhasil dibuat',
      });

      return {
        verified:       true,
        message:        'OTP berhasil diverifikasi. Gunakan link reset password.',
        resetToken,
        resetLink:      authHelper.buildResetPasswordLink(resetToken),
        expiresAt:      expiresAt.toISOString(),
      };
    }

    return { verified: true, message: 'OTP berhasil diverifikasi', userId: user.USER_ID };
  },

  // ── 4. LOGIN ──────────────────────────────────────────────
  async login({ identifier, password }, meta = {}) {
    // Cari user by email atau username
    const user = identifier.includes('@')
      ? await AuthRepository.findByEmail(identifier)
      : await AuthRepository.findByUsername(identifier);

    const INVALID = 'Email/username atau password salah';

    if (!user) throw new AppError(INVALID, 401);

    // Cek akun aktif
    if (user.IS_ACTIVE === 0)
      throw new AppError('Akun belum diverifikasi. Cek email untuk kode OTP.', 403);

    // Cek lockout
    if (user.LOCKED_UNTIL && new Date(user.LOCKED_UNTIL) > new Date())
      throw new AppError(
        `Akun terkunci hingga ${new Date(user.LOCKED_UNTIL).toLocaleString('id-ID')}. ` +
        'Terlalu banyak percobaan login gagal.',
        423
      );

    // Verify password
    const valid = await argon2.verify(user.PASSWORD_HASH, password);

    if (!valid) {
      const newAttempts = (user.FAILED_ATTEMPTS || 0) + 1;
      const shouldLock  = newAttempts >= config.lockout.maxFailedAttempts;
      const lockoutAt   = shouldLock
        ? new Date(Date.now() + config.lockout.lockMinutes * 60 * 1000)
        : null;

      await AuthRepository.incrementFailedAttempts(user.USER_ID, lockoutAt);
      await AuthRepository.createAuditLog({
        userId:    user.USER_ID,
        action:    'LOGIN',
        status:    'FAILED',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        detail:    `Attempt ${newAttempts}/${config.lockout.maxFailedAttempts}`,
      });

      if (shouldLock)
        throw new AppError(
          `Akun dikunci ${config.lockout.lockMinutes} menit karena terlalu banyak percobaan gagal.`,
          423
        );

      throw new AppError(INVALID, 401);
    }

    // Login berhasil — reset failed attempts
    await AuthRepository.resetFailedAttempts(user.USER_ID, meta.ip);

    // Ambil roles + permissions
    const { roles, permissions } = await AuthRepository.getUserRolesAndPermissions(user.USER_ID);

    // Build token
    const payload      = authHelper.buildJwtPayload(user, roles, permissions);
    const accessToken  = tokenHelper.signAccess(payload);
    const refreshToken = uuid();

    const decodedAccess = tokenHelper.decode(accessToken);

    await Promise.all([
      AuthRepository.saveToken({
        userId:     user.USER_ID,
        tokenType:  'ACCESS_JWT',
        tokenValue: decodedAccess.jti,
        expiresAt:  new Date(decodedAccess.exp * 1000),
        ipAddress:  meta.ip,
      }),
      AuthRepository.saveToken({
        userId:     user.USER_ID,
        tokenType:  'REFRESH',
        tokenValue: refreshToken,
        expiresAt:  authHelper.refreshExpiresAt(),
        deviceInfo: meta.userAgent,
        ipAddress:  meta.ip,
      }),
    ]);

    await AuthRepository.createAuditLog({
      userId:    user.USER_ID,
      action:    'LOGIN',
      status:    'SUCCESS',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      detail:    `Login dari ${meta.ip || 'unknown'}`,
    });

    return authHelper.buildAuthResponse(user, roles, permissions, accessToken, refreshToken);
  },

  // ── 5. REFRESH TOKEN ──────────────────────────────────────
  async refreshToken({ refreshToken }, meta = {}) {
    const tokenRecord = await AuthRepository.findRefreshToken(refreshToken);
    if (!tokenRecord)
      throw new AppError('Refresh token tidak valid atau sudah expired', 401);

    // Ambil data user terbaru (roles bisa berubah)
    const user = await AuthRepository.findByEmail(
      (await AuthRepository.getUserRolesAndPermissions(tokenRecord.USER_ID)).email
    );

    // Query ulang user by ID
    const { query: dbQuery } = require('../../shared/utils/db');
    const userResult = await dbQuery(
      `SELECT user_id, username, email, full_name, is_active
       FROM users WHERE user_id = :userId AND deleted_at IS NULL`,
      { userId: tokenRecord.USER_ID }
    );

    if (!userResult.rows[0] || userResult.rows[0].IS_ACTIVE === 0)
      throw new AppError('Akun tidak aktif', 403);

    const freshUser = userResult.rows[0];
    const { roles, permissions } = await AuthRepository.getUserRolesAndPermissions(freshUser.USER_ID);

    // Revoke refresh token lama
    await AuthRepository.revokeToken(refreshToken, 'REFRESH');

    // Issue token baru
    const payload         = authHelper.buildJwtPayload(freshUser, roles, permissions);
    const newAccessToken  = tokenHelper.signAccess(payload);
    const newRefreshToken = uuid();
    const decodedAccess   = tokenHelper.decode(newAccessToken);

    await Promise.all([
      AuthRepository.saveToken({
        userId:     freshUser.USER_ID,
        tokenType:  'ACCESS_JTI',
        tokenValue: decodedAccess.jti,
        expiresAt:  new Date(decodedAccess.exp * 1000),
        ipAddress:  meta.ip,
      }),
      AuthRepository.saveToken({
        userId:     freshUser.USER_ID,
        tokenType:  'REFRESH',
        tokenValue: newRefreshToken,
        expiresAt:  authHelper.refreshExpiresAt(),
        ipAddress:  meta.ip,
      }),
    ]);

    await AuthRepository.createAuditLog({
      userId: freshUser.USER_ID, action: 'TOKEN_REFRESH', status: 'SUCCESS', ipAddress: meta.ip,
    });

    return authHelper.buildAuthResponse(freshUser, roles, permissions, newAccessToken, newRefreshToken);
  },

  // ── 6. LOGOUT ─────────────────────────────────────────────
  async logout({ userId, jti, refreshToken }, meta = {}) {
    await AuthRepository.revokeAllUserTokens(userId, 'LOGOUT');
    await AuthRepository.createAuditLog({
      userId, action: 'LOGOUT', status: 'SUCCESS', ipAddress: meta.ip,
    });
    return { message: 'Logout berhasil' };
  },

  // ── 7. ME — ambil data user + roles + permissions ─────────
  async me(userId) {
    const { query: dbQuery } = require('../../shared/utils/db');
    const userResult = await dbQuery(
      `SELECT user_id, username, email, full_name, phone_number,
              profile_picture_url, is_active, created_at
       FROM   users WHERE user_id = :userId AND deleted_at IS NULL`,
      { userId }
    );

    const user = userResult.rows[0];
    if (!user) throw new AppError('User tidak ditemukan', 404);

    const { roles, permissions } = await AuthRepository.getUserRolesAndPermissions(userId);

    return {
      user: {
        userId:            user.USER_ID,
        username:          user.USERNAME,
        email:             user.EMAIL,
        fullName:          user.FULL_NAME,
        phoneNumber:       user.PHONE_NUMBER,
        profilePictureUrl: user.PROFILE_PICTURE_URL,
        isActive:          user.IS_ACTIVE === 1,
        createdAt:         user.CREATED_AT,
      },
      roles: roles.map(r => ({ roleId: r.ROLE_ID, roleCode: r.ROLE_CODE, roleName: r.ROLE_NAME })),
      permissions: permissions.map(p => ({
        permissionCode: p.PERMISSION_CODE,
        module:         p.MODULE,
        action:         p.ACTION,
      })),
    };
  },

  // ── 8. Forgot Password ──────────────────────────────────────
  async forgotPassword({ email }, meta = {}) {
    // Validasi duplikat
    const existEmail = await AuthRepository.findByEmail(email);
    if (!existEmail) throw new AppError('Email tidak ditemukan', 404);

    // Kirim OTP email verify
    const otp     = authHelper.generateOtp();
    const otpHash = await argon2.hash(otp, {
      ...config.argon2, memoryCost: 19456, timeCost: 2,
    });

    await AuthRepository.createOtp({
      userId: existEmail.USER_ID,
      otpHash,
      purpose:   'PASSWORD_RESET',
      expiresAt: authHelper.otpExpiresAt(),
    });

    await emailService.sendOtp({ to: email, username: existEmail.USERNAME, otp, purpose: 'PASSWORD_RESET' });

    await AuthRepository.createAuditLog({
      userId:    existEmail.USER_ID,
      action:    'PASSWORD_RESET',
      status:    'SUCCESS',
      ipAddress: meta.ip,
      detail:    'Password reset token berhasil dibuat',
    });
    
    return {
      userId: existEmail.USER_ID,
      email,
      message: `OTP reset password telah dikirim ke ${email}`,
    };
  },

  // ── 9. VERIFY RESET TOKEN (link reset password) ───────────
  async verifyResetToken({ token }) {
    const user = await AuthRepository.findByPasswordResetToken(token);
    if (!user)
      throw new AppError('Token reset password tidak valid atau sudah kadaluarsa', 400);

    return {
      valid:     true,
      email:     authHelper.maskEmail(user.EMAIL),
      expiresAt: user.PASSWORD_RESET_EXPIRES,
      message:   'Token reset password valid',
    };
  },

  // ── 10. RESET PASSWORD ─────────────────────────────────────
  async resetPassword({ token, password }, meta = {}) {
    const user = await AuthRepository.findByPasswordResetToken(token);
    if (!user)
      throw new AppError('Token reset password tidak valid atau sudah kadaluarsa', 400);

    const passwordHash = await argon2.hash(password, config.argon2);

    await AuthRepository.updatePassword(user.USER_ID, passwordHash);
    await AuthRepository.revokeAllUserTokens(user.USER_ID, 'PASSWORD_RESET');

    await AuthRepository.createAuditLog({
      userId:    user.USER_ID,
      action:    'PASSWORD_CHANGE',
      status:    'SUCCESS',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      detail:    'Password berhasil direset',
    });

    return { message: 'Password berhasil direset. Silakan login dengan password baru.' };
  },

  // ── AUTHORIZATION — profile, role grants, module permissions ──

  async _assertUserExists(userId) {
    const user = await AuthRepository.findUserById(userId);
    if (!user) throw new AppError('User tidak ditemukan', 404);
    return user;
  },

  async getProfile(userId) {
    const user = await this._assertUserExists(userId);
    return authHelper.toProfileShape(user);
  },

  async getRoleGrants(userId) {
    await this._assertUserExists(userId);

    const [allRoles, assignedRoles] = await Promise.all([
      AuthRepository.findAllActiveRoles(),
      AuthRepository.findAssignedRoles(userId),
    ]);

    const assignedIds = assignedRoles.map((r) => r.ROLE_ID);
    const allMapped   = allRoles.map(authHelper.toRoleShape);
    const assignedMapped = assignedRoles.map(authHelper.toRoleShape);
    const assignedSet = new Set(assignedIds);

    return {
      available: allMapped.filter((r) => !assignedSet.has(r.roleId)),
      assigned:  assignedMapped,
    };
  },

  async updateRoleGrants(userId, roleIds, actorId, meta = {}) {
    await this._assertUserExists(userId);

    if (roleIds.length > 0) {
      const validRoles = await AuthRepository.findRolesByIds(roleIds);
      if (validRoles.length !== roleIds.length) {
        throw new AppError('Satu atau lebih role_id tidak valid', 422);
      }
    }

    const { toAdd, toRemove } = await AuthRepository.syncUserRoles(userId, roleIds, actorId);

    for (const roleId of toAdd) {
      await AuthRepository.createAuditLog({
        userId: actorId,
        action: 'ROLE_ASSIGN',
        status: 'SUCCESS',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        detail: `Assign role_id ${roleId} ke user_id ${userId}`,
      });
    }

    for (const roleId of toRemove) {
      await AuthRepository.createAuditLog({
        userId: actorId,
        action: 'ROLE_REMOVE',
        status: 'SUCCESS',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        detail: `Cabut role_id ${roleId} dari user_id ${userId}`,
      });
    }

    if (toAdd.length > 0 || toRemove.length > 0) {
      await AuthRepository.revokeAllUserTokens(userId, 'ADMIN');
    }

    return this.getRoleGrants(userId);
  },

  async getModules() {
    const modules = await AuthRepository.findDistinctModules();
    return { modules };
  },

  async getModuleActions(module) {
    const permissions = await AuthRepository.findPermissionsByModule(module);
    if (permissions.length === 0) {
      throw new AppError(`Modul "${module}" tidak ditemukan`, 404);
    }

    return {
      module,
      actions: permissions.map(authHelper.toPermissionShape),
    };
  },

  async getUserModulePermissions(userId, module) {
    await this._assertUserExists(userId);

    const [allPerms, directPerms] = await Promise.all([
      AuthRepository.findPermissionsByModule(module),
      AuthRepository.findDirectPermissions(userId, module),
    ]);

    if (allPerms.length === 0) {
      throw new AppError(`Modul "${module}" tidak ditemukan`, 404);
    }

    const assignedIds = directPerms.map((p) => p.PERMISSION_ID);
    const allMapped   = allPerms.map(authHelper.toPermissionShape);
    const assignedMapped = directPerms.map(authHelper.toPermissionShape);
    const assignedSet = new Set(assignedIds);

    return {
      module,
      available: allMapped.filter((p) => !assignedSet.has(p.permissionId)),
      assigned:  assignedMapped,
    };
  },

  async updateUserModulePermissions(userId, module, permissionIds, actorId, meta = {}) {
    await this._assertUserExists(userId);

    const modulePerms = await AuthRepository.findPermissionsByModule(module);
    if (modulePerms.length === 0) {
      throw new AppError(`Modul "${module}" tidak ditemukan`, 404);
    }

    const validModuleIds = new Set(modulePerms.map((p) => p.PERMISSION_ID));
    const invalid = permissionIds.filter((id) => !validModuleIds.has(id));
    if (invalid.length > 0) {
      throw new AppError(
        `permission_id tidak valid untuk modul ${module}: ${invalid.join(', ')}`,
        422
      );
    }

    const { toAdd, toRemove } = await AuthRepository.syncUserPermissions(
      userId, module, permissionIds, actorId
    );

    for (const permissionId of toAdd) {
      await AuthRepository.createAuditLog({
        userId: actorId,
        action: 'PERMISSION_ASSIGN',
        status: 'SUCCESS',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        detail: `Assign permission_id ${permissionId} ke user_id ${userId} modul ${module}`,
      });
    }

    for (const permissionId of toRemove) {
      await AuthRepository.createAuditLog({
        userId: actorId,
        action: 'PERMISSION_REMOVE',
        status: 'SUCCESS',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        detail: `Cabut permission_id ${permissionId} dari user_id ${userId} modul ${module}`,
      });
    }

    if (toAdd.length > 0 || toRemove.length > 0) {
      await AuthRepository.revokeAllUserTokens(userId, 'ADMIN');
    }

    return this.getUserModulePermissions(userId, module);
  },
};

module.exports = AuthService;
