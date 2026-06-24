const { v4: uuid } = require('uuid');
const config       = require('../../../config');

// ── Helper: generate OTP numerik ─────────────────────────────
const generateOtp = () => {
  const len = config.otp.length;
  const min = Math.pow(10, len - 1);
  const max = Math.pow(10, len) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
};

// ── Helper: expiry date ───────────────────────────────────────
const otpExpiresAt = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + config.otp.expiryMinutes);
  return d;
};

const refreshExpiresAt = () => {
  const d   = new Date();
  const str = config.jwt.refreshExpiresIn; // e.g. '7d'
  const num = parseInt(str);
  if (str.endsWith('d')) d.setDate(d.getDate() + num);
  if (str.endsWith('h')) d.setHours(d.getHours() + num);
  return d;
};

const passwordResetExpiresAt = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + config.passwordReset.expiryMinutes);
  return d;
};

const generatePasswordResetToken = () => uuid();

const maskEmail = (email) => {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
};

const buildResetPasswordLink = (token) => {
  const base = config.passwordReset.frontendUrl.replace(/\/$/, '');
  return `${base}/reset-password/${token}`;
};

// ── Helper: build JWT payload (roles + permissions pake flat arrays) ──
const buildJwtPayload = (user, roles, permissions) => ({
  sub:         user.USER_ID,
  username:    user.USERNAME,
  email:       user.EMAIL,
  fullName:    user.FULL_NAME,
  roles:       roles.map(r => r.ROLE_CODE),          // ['ADMIN','USER']
  permissions: permissions.map(p => p.PERMISSION_CODE), // ['dept:read','dept:write']
});

// ── Helper: build response data (untuk cache/session di client) ──────
const buildAuthResponse = (user, roles, permissions, accessToken, refreshToken) => ({
  user: {
    userId:    user.USER_ID,
    username:  user.USERNAME,
    email:     user.EMAIL,
    fullName:  user.FULL_NAME,
    isActive:  user.IS_ACTIVE === 1,
  },
  roles: roles.map(r => ({
    roleId:   r.ROLE_ID,
    roleCode: r.ROLE_CODE,
    roleName: r.ROLE_NAME,
  })),
  permissions: permissions.map(p => ({
    permissionCode: p.PERMISSION_CODE,
    module:         p.MODULE,
    action:         p.ACTION,
  })),
  accessToken,
  refreshToken,
  accessTokenExpiry: new Date(
    Date.now() + parseExpiry(config.jwt.accessExpiresIn)
  ).toISOString(),
});

const parseExpiry = (str) => {
  const num = parseInt(str);
  if (str.endsWith('m')) return num * 60 * 1000;
  if (str.endsWith('h')) return num * 60 * 60 * 1000;
  if (str.endsWith('d')) return num * 24 * 60 * 60 * 1000;
  return 15 * 60 * 1000;
};

module.exports = {
  generateOtp,
  otpExpiresAt,
  refreshExpiresAt,
  passwordResetExpiresAt,
  generatePasswordResetToken,
  maskEmail,
  buildResetPasswordLink,
  buildJwtPayload,
  buildAuthResponse,
  parseExpiry,
};