# SQLite migration guide

The current application datasource is SQLite. Back up the database before applying any migration:

```bash
cp /home/ls-jl/apps/data/eduverse.db /home/ls-jl/apps/data/eduverse-before-migration.db
```

The workspace backup created before this remediation is:

`/home/ls-jl/apps/data/eduverse-before-real-data-20260916-020450.db`

Apply migrations in filename order with `prisma db execute`, using the same `DATABASE_URL` as the services. The 2026-09-16 migrations are additive. Existing preview and quiz rows are retained; nullable score-detail fields are not backfilled by guessing.

```bash
cd /home/ls-jl/apps
DATABASE_URL=file:/home/ls-jl/apps/data/eduverse.db corepack pnpm prisma db execute \
  --file apps/database/migrations/20260916_real_data.sql \
  --schema packages/db/prisma/schema.prisma
DATABASE_URL=file:/home/ls-jl/apps/data/eduverse.db corepack pnpm prisma db execute \
  --file apps/database/migrations/20260916_roleplay_lifecycle.sql \
  --schema packages/db/prisma/schema.prisma
DATABASE_URL=file:/home/ls-jl/apps/data/eduverse.db corepack pnpm prisma db execute \
  --file apps/database/migrations/20260916_quiz_score_details.sql \
  --schema packages/db/prisma/schema.prisma
DATABASE_URL=file:/home/ls-jl/apps/data/eduverse.db corepack pnpm prisma db execute \
  --file apps/database/migrations/20260916_tutoring_recording.sql \
  --schema packages/db/prisma/schema.prisma
DATABASE_URL=file:/home/ls-jl/apps/data/eduverse.db corepack pnpm db:generate
```

These SQL files are not idempotent: do not apply the same file twice. Check columns first with `PRAGMA table_info('<table>')` or use a migration ledger in deployment automation.

Rollback is restore-from-backup. SQLite cannot safely drop all added columns in every supported runtime, and removing the new tables would delete classroom records. Stop both services, preserve the current database for audit, replace it with the backup, regenerate Prisma Client for the matching schema, then restart.

Legacy plaintext classroom passwords remain usable once; a successful password join replaces the value with bcrypt. New classroom passwords are always hashed.
