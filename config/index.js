require('dotenv').config();

module.exports = {
  app: {
    port:   parseInt(process.env.PORT) || 3000,
    env:    process.env.NODE_ENV || 'development',
    isDev:  process.env.NODE_ENV !== 'production',
    prefix: '/api',
  },

  db: {
    user:          process.env.DB_USER       || 'hr',
    password:      process.env.DB_PASSWORD   || 'hr',
    connectString: `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 1521}/${process.env.DB_SERVICE || 'XE'}`,
    pool: {
      min:       parseInt(process.env.DB_POOL_MIN)       || 2,
      max:       parseInt(process.env.DB_POOL_MAX)       || 10,
      increment: parseInt(process.env.DB_POOL_INCREMENT) || 1,
    },
  },

  jwt: {
    accessSecret:     process.env.JWT_ACCESS_SECRET,
    refreshSecret:    process.env.JWT_REFRESH_SECRET,
    accessExpiresIn:  process.env.JWT_ACCESS_EXPIRES  || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  },

  argon2: {
    type:        2,       // Argon2id
    memoryCost:  65536,
    timeCost:    3,
    parallelism: 4,
  },

  otp: {
    length:        6,
    expiryMinutes: 10,
    maxAttempts:   3,
  },

  passwordReset: {
    expiryMinutes: 10,
    frontendUrl:   process.env.FRONTEND_URL || 'http://localhost:5173',
  },

  lockout: {
    maxFailedAttempts: 5,
    lockMinutes:       30,
  },

  mail: {
    host:     process.env.MAIL_HOST     || 'smtp.gmail.com',
    port:     parseInt(process.env.MAIL_PORT) || 587,
    secure:   process.env.MAIL_SECURE   === 'true',
    user:     process.env.MAIL_USER,
    password: process.env.MAIL_PASSWORD,
    from:     process.env.MAIL_FROM     || '"App" <no-reply@app.com>',
  },
};
