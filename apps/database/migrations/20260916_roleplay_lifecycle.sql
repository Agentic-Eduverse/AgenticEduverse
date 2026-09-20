-- Incremental migration: add a real lifecycle to role-play activities.
-- Existing scenarios remain drafts and are not auto-published.
ALTER TABLE "RolePlayScenario" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "RolePlayScenario" ADD COLUMN "startedAt" DATETIME;
ALTER TABLE "RolePlayScenario" ADD COLUMN "endedAt" DATETIME;
