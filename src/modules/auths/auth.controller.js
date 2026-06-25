const AuthService = require('./auth.service');
const response    = require('../../shared/utils/response');

// Helper ambil meta dari request
const getMeta = (req) => ({
  ip:        req.ip || req.headers['x-forwarded-for'] || 'unknown',
  userAgent: req.headers['user-agent'] || 'unknown',
});

const AuthController = {

  // POST /auth/signup
  async signup(req, res, next) {
    try {
      const { username, email, password, fullName } = req.body;
      const data = await AuthService.signup(
        { username, email, password, fullName },
        getMeta(req)
      );
      response.success(res, data, 'Registrasi berhasil. Cek email untuk kode OTP.', 201);
    } catch (e) { next(e); }
  },

  // POST /auth/send-otp
  async sendOtp(req, res, next) {
    try {
      const { email, purpose } = req.body;
      const data = await AuthService.sendOtp({ email, purpose }, getMeta(req));
      response.success(res, data, 'OTP berhasil dikirim');
    } catch (e) { next(e); }
  },

  // POST /auth/verify-otp
  async verifyOtp(req, res, next) {
    try {
      const { email, otp, purpose } = req.body;
      const data = await AuthService.verifyOtp({ email, otp, purpose }, getMeta(req));
      response.success(res, data, data.message || 'OTP berhasil diverifikasi');
    } catch (e) { next(e); }
  },

  // POST /auth/login
  async login(req, res, next) {
    try {
      const { identifier, password } = req.body;
      const data = await AuthService.login({ identifier, password }, getMeta(req));
      response.success(res, data, 'Login berhasil');
    } catch (e) { next(e); }
  },

  // POST /auth/refresh
  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const data = await AuthService.refreshToken({ refreshToken }, getMeta(req));
      response.success(res, data, 'Token berhasil diperbarui');
    } catch (e) { next(e); }
  },

  // POST /auth/logout
  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const data = await AuthService.logout(
        { userId: req.user.sub, jti: req.user.jti, refreshToken },
        getMeta(req)
      );
      response.success(res, data, 'Logout berhasil');
    } catch (e) { next(e); }
  },

  // GET /auth/me
  async me(req, res, next) {
    try {
      const data = await AuthService.me(req.user.sub);
      response.success(res, data, 'Data user berhasil diambil');
    } catch (e) { next(e); }
  },

  // POST /auth/forgot-password
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const data = await AuthService.forgotPassword({ email }, getMeta(req));
      response.success(res, data, data.message);
    } catch (e) { next(e); }
  },

  // GET /auth/reset-password/:token
  async verifyResetToken(req, res, next) {
    try {
      const { token } = req.params;
      const data = await AuthService.verifyResetToken({ token });
      response.success(res, data, data.message);
    } catch (e) { next(e); }
  },

  // POST /auth/reset-password/:token
  async resetPassword(req, res, next) {
    try {
      const { token } = req.params;
      const { password } = req.body;
      const data = await AuthService.resetPassword({ token, password }, getMeta(req));
      response.success(res, data, data.message);
    } catch (e) { next(e); }
  },

  // ── Authorization ─────────────────────────────────────────

  // GET /auth/profile/:userId
  async getProfile(req, res, next) {
    try {
      const data = await AuthService.getProfile(req.params.userId);
      response.success(res, data, 'Profil user berhasil diambil');
    } catch (e) { next(e); }
  },

  // GET /auth/profile/:userId/roles
  async getRoleGrants(req, res, next) {
    try {
      const data = await AuthService.getRoleGrants(req.params.userId);
      response.success(res, data, 'Role grants berhasil diambil');
    } catch (e) { next(e); }
  },

  // PUT /auth/profile/:userId/roles
  async updateRoleGrants(req, res, next) {
    try {
      const { roleIds } = req.body;
      const data = await AuthService.updateRoleGrants(
        req.params.userId,
        roleIds,
        req.user.sub,
        getMeta(req)
      );
      response.success(res, data, 'Role grants berhasil diperbarui');
    } catch (e) { next(e); }
  },

  // GET /auth/permissions/modules
  async getModules(req, res, next) {
    try {
      const data = await AuthService.getModules();
      response.success(res, data, 'Daftar modul berhasil diambil');
    } catch (e) { next(e); }
  },

  // GET /auth/permissions/modules/:module/actions
  async getModuleActions(req, res, next) {
    try {
      const data = await AuthService.getModuleActions(req.params.module);
      response.success(res, data, 'Daftar action modul berhasil diambil');
    } catch (e) { next(e); }
  },

  // GET /auth/profile/:userId/permissions?module=DEPARTMENT
  async getUserModulePermissions(req, res, next) {
    try {
      const data = await AuthService.getUserModulePermissions(
        req.params.userId,
        req.query.module
      );
      response.success(res, data, 'Permission modul berhasil diambil');
    } catch (e) { next(e); }
  },

  // PUT /auth/profile/:userId/permissions
  async updateUserModulePermissions(req, res, next) {
    try {
      const { module, permissionIds } = req.body;
      const data = await AuthService.updateUserModulePermissions(
        req.params.userId,
        module,
        permissionIds,
        req.user.sub,
        getMeta(req)
      );
      response.success(res, data, 'Permission modul berhasil diperbarui');
    } catch (e) { next(e); }
  },
};

module.exports = AuthController;
