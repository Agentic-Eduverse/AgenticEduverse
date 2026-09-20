CREATE TABLE IF NOT EXISTS parent_invitations (
  id TEXT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  teacher_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES "Class"(id) ON DELETE CASCADE,
  parent_email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  redeemed_by TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parent_invitations_teacher_class_idx
  ON parent_invitations (teacher_id, class_id, created_at DESC);

CREATE TABLE IF NOT EXISTS parent_student_links (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  created_by_teacher_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  invitation_id TEXT NOT NULL UNIQUE REFERENCES parent_invitations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS parent_student_links_active_unique
  ON parent_student_links (parent_id, student_id)
  WHERE revoked_at IS NULL;
