-- ============================================================
-- MIGRATION 02 — user_permissions + audit actions + view update
-- Jalankan setelah 01_schema.sql
-- ============================================================

-- ── 1. USER_PERMISSIONS ─────────────────────────────────────
CREATE TABLE user_permissions (
  user_id       NUMBER(10) NOT NULL,
  permission_id NUMBER(10) NOT NULL,
  granted_at    TIMESTAMP  DEFAULT SYSTIMESTAMP NOT NULL,
  granted_by    NUMBER(10),

  CONSTRAINT pk_user_permissions
    PRIMARY KEY (user_id, permission_id),
  CONSTRAINT fk_up_user
    FOREIGN KEY (user_id)       REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_up_permission
    FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE
);

CREATE INDEX idx_up_user       ON user_permissions(user_id);
CREATE INDEX idx_up_permission ON user_permissions(permission_id);

COMMENT ON TABLE user_permissions IS 'Grant permission langsung ke user — override/tambahan di luar role';


-- ── 2. AUDIT_LOGS — tambah action PERMISSION_ASSIGN / PERMISSION_REMOVE ──
ALTER TABLE audit_logs DROP CONSTRAINT ck_al_action;

ALTER TABLE audit_logs ADD CONSTRAINT ck_al_action CHECK (action IN (
  'LOGIN',
  'LOGOUT',
  'REGISTER',
  'EMAIL_VERIFY',
  'PASSWORD_RESET',
  'PASSWORD_CHANGE',
  'PIN_SETUP',
  'PIN_VERIFY',
  'TOKEN_REFRESH',
  'TOKEN_REVOKE',
  'ROLE_ASSIGN',
  'ROLE_REMOVE',
  'PERMISSION_ASSIGN',
  'PERMISSION_REMOVE',
  'ACCOUNT_LOCK',
  'ACCOUNT_UNLOCK'
));


-- ── 3. VIEW — permission efektif (role + direct) ─────────────
CREATE OR REPLACE VIEW v_user_permissions AS
SELECT DISTINCT
  u.user_id,
  u.username,
  p.permission_code,
  p.module,
  p.action,
  'ROLE' AS source
FROM users           u
JOIN user_roles      ur ON ur.user_id      = u.user_id
                        AND (ur.expires_at IS NULL OR ur.expires_at > SYSTIMESTAMP)
JOIN roles           r  ON r.role_id       = ur.role_id
                        AND r.is_active    = 1
JOIN role_permissions rp ON rp.role_id    = r.role_id
JOIN permissions     p  ON p.permission_id = rp.permission_id
WHERE u.deleted_at IS NULL
  AND u.is_active   = 1

UNION

SELECT DISTINCT
  u.user_id,
  u.username,
  p.permission_code,
  p.module,
  p.action,
  'DIRECT' AS source
FROM users           u
JOIN user_permissions up ON up.user_id      = u.user_id
JOIN permissions      p  ON p.permission_id = up.permission_id
WHERE u.deleted_at IS NULL
  AND u.is_active   = 1;

COMMENT ON TABLE v_user_permissions IS 'Semua permission efektif per user — role + direct grant';


-- ── 4. (Opsional) Seed permission modul ROLE — READ/WRITE/DELETE ──
INSERT INTO permissions (permission_id, permission_code, module, action, description) VALUES
  (seq_permissions.NEXTVAL, 'role:read',   'ROLE', 'READ',   'Lihat daftar dan detail role');
INSERT INTO permissions (permission_id, permission_code, module, action, description) VALUES
  (seq_permissions.NEXTVAL, 'role:write',  'ROLE', 'WRITE',  'Buat dan edit role');
INSERT INTO permissions (permission_id, permission_code, module, action, description) VALUES
  (seq_permissions.NEXTVAL, 'role:delete', 'ROLE', 'DELETE', 'Hapus role');

COMMIT;
