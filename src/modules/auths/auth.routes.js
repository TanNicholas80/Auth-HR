const express      = require('express');
const AuthController = require('./auth.controller');
const {
  validateSignup,
  validateLogin,
  validateSendOtp,
  validateVerifyOtp,
  validateRefresh,
  validateLogout,
  validateResetTokenParam,
  validateResetPasswordBody,
  validateForgotPasswordBody,
} = require('./auth.validator');
const authenticate = require('../../shared/middlewares/authenticate');

const router = express.Router();

// ── PUBLIC routes ─────────────────────────────────────────

/**
 * @route  POST /api/auth/signup
 * @desc   Daftar akun baru, kirim OTP ke email
 * @access Public
 */
router.post('/signup', validateSignup, AuthController.signup);

/**
 * @route  POST /api/auth/send-otp
 * @desc   Kirim / resend OTP untuk berbagai keperluan
 * @access Public
 * @body   { email, purpose: EMAIL_VERIFY | PASSWORD_RESET | ... }
 */
router.post('/send-otp', validateSendOtp, AuthController.sendOtp);

/**
 * @route  POST /api/auth/verify-otp
 * @desc   Verifikasi OTP. Jika EMAIL_VERIFY → return JWT langsung
 * @access Public
 * @body   { email, otp, purpose }
 */
router.post('/verify-otp', validateVerifyOtp, AuthController.verifyOtp);

/**
 * @route  POST /api/auth/forgot-password
 * @desc   Kirim OTP reset password ke email
 * @access Public
 * @body   { email }
 */
router.post('/forgot-password', validateForgotPasswordBody, AuthController.forgotPassword);

/**
 * @route  GET /api/auth/reset-password/:token
 * @desc   Verifikasi token dari link reset password (unik per user)
 * @access Public
 */
router.get(
  '/reset-password/:token',
  validateResetTokenParam,
  AuthController.verifyResetToken
);

/**
 * @route  POST /api/auth/reset-password/:token
 * @desc   Reset password — token di URL, body: { password, confirmPassword }
 * @access Public
 */
router.post(
  '/reset-password/:token',
  validateResetTokenParam,
  validateResetPasswordBody,
  AuthController.resetPassword
);

/**
 * @route  POST /api/auth/login
 * @desc   Login dengan email atau username + password
 * @access Public
 * @body   { identifier: email|username, password }
 */
router.post('/login', validateLogin, AuthController.login);

/**
 * @route  POST /api/auth/refresh
 * @desc   Refresh access token menggunakan refresh token
 * @access Public
 * @body   { refreshToken }
 */
router.post('/refresh', validateRefresh, AuthController.refresh);

// ── PROTECTED routes ──────────────────────────────────────

/**
 * @route  POST /api/auth/logout
 * @desc   Revoke semua token user
 * @access Private
 * @body   { refreshToken }
 */
router.post('/logout', authenticate, validateLogout, AuthController.logout);

/**
 * @route  GET /api/auth/me
 * @desc   Ambil data user yang sedang login + roles + permissions
 * @access Private
 */
router.get('/me', authenticate, AuthController.me);

module.exports = router;
