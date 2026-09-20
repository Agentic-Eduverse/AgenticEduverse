# Agentic EduVerse

A local-first intelligent classroom platform for teachers, students, and parents. The project brings class management, live lessons, audio and video, a shared whiteboard, learning materials, quizzes, class recording, AI tutors, translation, parent reports, and a multilingual interface together in a single pnpm monorepo.

> This repository currently targets local development, demonstrations, and prototype validation. Before deploying to production, replace all development secrets, use HTTPS, enable production-grade Redis and database services, and complete security and capacity assessments.

---

## Table of Contents

- [Core Features](#core-features)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [AI Tutors and ZenMux](#ai-tutors-and-zenmux)
- [Audio, Video, and Recording](#audio-video-and-recording)
- [Real-Time Classroom](#real-time-classroom)
- [Permissions and Roles](#permissions-and-roles)
- [Internationalization](#internationalization)
- [Testing and Quality Checks](#testing-and-quality-checks)
- [Deployment Recommendations](#deployment-recommendations)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Git Workflow](#git-workflow)
- [Project Scope](#project-scope)

---

## Core Features

### Teacher Portal

- Create and manage classes, generate six-character room codes, and optionally require a password to join.
- Start and end lessons, and monitor participants, emotional feedback, raised hands, and classroom chat.
- Use real-time audio and video, camera, microphone, and screen sharing.
- Collaborate on a shared whiteboard with drawing, clearing, undo, and cross-client synchronization.
- Upload class materials; student clients refresh immediately through Socket notifications, with polling as a fallback.
- Create quizzes manually or generate them from learning materials with AI.
- Use classroom heat maps, one-to-one tutoring queues, and role-play activities.
- Record a composite lesson in the browser, upload it to local storage, and play it back with HTTP Range support.
- Generate parent invitations that expire after 24 hours, can be used only once, and are tied to a specific email address.
- Access pre-class preparation and post-class analytics when server-side AI is configured.

### Student Portal

- Join a class with a room code and optional password.
- View enrolled classes, learning statistics, coins, and classroom entry points.
- Watch and listen to the teacher, participate in chat and whiteboard activities, answer quizzes, share emotional feedback, and raise a hand.
- Use five independent AI tutors: General, Mathematics, Chinese, English, and Programming.
- Keep separate conversation histories for every tutor, preventing conversations from leaking across subjects.
- Switch between ZenMux models using friendly names for four product-approved models.
- Receive streamed AI responses, followed by practice questions, explanations, and related videos after the complete result is validated.
- View up to five concept-explanation videos for each answer and open them on an external video page.
- Use a built-in translator with automatic language detection, bidirectional swapping, copy-to-clipboard, and recent translations.
- Configure a virtual character or avatar and earn coins through participation.

### Parent Portal

- Link a child through a teacher-issued invitation URL or invitation code.
- Review attendance, study time, emotional trends, quiz performance, and coins.
- Generate AI-powered weekly reports from real classroom data.
- Validate the invited email address during linking to prevent unauthorized claims of student accounts.

### Platform Capabilities

- Enforce single-role account isolation: teachers, students, and parents enter separate portals.
- Support eight interface languages: Chinese, English, German, French, Italian, Russian, Spanish, and Japanese.
- Persist language selection in both cookies and localStorage; server-render the initial page from the cookie to reduce language flicker.
- Use a SQLite and Prisma data layer with 20 business models.
- Keep Socket.IO classroom events and LiveKit media independent while linking both systems through `classId`.

---

## System Architecture

```text
Browser
  |
  | HTTP / NextAuth / NDJSON stream
  v
apps/web (Next.js :3000)
  |-- pages and React UI
  |-- Next.js API routes
  |-- auth, class APIs, AI proxy, files, recordings
  |-- Prisma -> SQLite
  |
  | Socket.IO ticket
  v
apps/server (Express + Socket.IO :4000)
  |-- classroom rooms: class:<classId>
  |-- chat / whiteboard / quiz / emotion / hand raise
  |-- Redis or memory:// state
  |
  | LiveKit JWT
  v
LiveKit (:7880)
  |-- media rooms: class-<classId>
  |-- private rooms: tutoring-<tutoringId>

Shared workspace packages
  packages/shared  shared TS contracts and socket events
  packages/db      Prisma client and database entry
  packages/ai      server-side AI calls, schemas and memory
```

### Two Types of Rooms

| System | Naming Convention | Purpose |
|---|---|---|
| Socket.IO | `class:<classId>` | Data events for chat, whiteboard, quizzes, emotions, online status, and more |
| LiveKit | `class-<classId>` | Audio, video, and screen sharing |

These are independent connections. A Socket disconnection does not necessarily interrupt media, and a media disconnection does not necessarily interrupt the whiteboard or chat.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Web | Next.js 14.2, React 18, TypeScript, Tailwind CSS |
| Authentication | Auth.js / NextAuth 5 beta, Credentials login, bcrypt |
| Real-time classroom | Express, Socket.IO, single-use HMAC tickets |
| Audio and video | LiveKit client and server SDKs, local LiveKit Server |
| Database | SQLite, Prisma 6.19 |
| AI | ZenMux OpenAI-compatible API, WorkBuddy Cloud SDK, Zod |
| Animation and visuals | Framer Motion, PixiJS, Recharts, Lucide |
| Package management | pnpm workspace 9.15.9 |

---

## Repository Structure

```text
E:/apps
├─ apps/
│  ├─ web/                 Next.js pages and API routes
│  │  ├─ src/app/          App Router pages and APIs
│  │  ├─ src/components/   Page and business components
│  │  ├─ src/lib/          API client, AI, recording, i18n, and more
│  │  ├─ scripts/          Browser tests and ZenMux configuration utility
│  │  └─ .env.example
│  ├─ server/              Express + Socket.IO real-time backend
│  │  ├─ src/index.ts
│  │  ├─ src/socket-handlers.ts
│  │  └─ .env.example
│  ├─ infra/media/         LiveKit / Docker media stack configuration
│  └─ database/migrations/ Manual SQLite SQL migrations
├─ packages/
│  ├─ ai/                  AI calls, SSE parsing, and Zod output validation
│  ├─ db/                  Prisma Client and schema
│  └─ shared/              Types and Socket events shared by client and server
├─ data/                   Local database, materials, and recordings (Git-ignored)
├─ docs/                   Feature inventory and roadshow materials
├─ pnpm-workspace.yaml
├─ start-dev.bat           Windows launcher for the three local services
└─ README.md
```

Keep dependencies flowing in this direction: `apps/* -> packages/*`. Shared packages should not depend on specific applications.

---

## Quick Start

### Prerequisites

- Windows 10/11. The current local media launcher targets Windows.
- Node.js 20 or later. Node.js 22 is currently validated.
- pnpm 9.15.9.
- Optional: a local LiveKit Windows binary.
- Docker is required only for the complete LiveKit + Egress + MinIO + Caddy stack. The basic local setup does not require Docker.

### 1. Install Dependencies

```powershell
cd E:\apps
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install
```

If the official npm registry is unavailable on your network, temporarily use a mirror:

```powershell
pnpm install --registry=https://registry.npmmirror.com
```

Do not mix npm and pnpm. This repository maintains only `pnpm-lock.yaml`; `package-lock.json` is ignored.

### 2. Create Local Environment Files

```powershell
Copy-Item apps\web\.env.example apps\web\.env
Copy-Item apps\server\.env.example apps\server\.env
```

At minimum, update:

- The absolute SQLite path.
- `NEXTAUTH_SECRET`.
- The same `SOCKET_TICKET_SECRET` in both Web and Socket services.
- The LiveKit URL, key, and secret when audio and video are required.
- The ZenMux key when third-party AI is required.

### 3. Generate Prisma Client

```powershell
$env:DATABASE_URL = "file:E:/apps/data/eduverse.db"
pnpm db:generate
```

If the project was copied from Linux to Windows, regenerate Prisma Client. Otherwise, the native Prisma engine will target the wrong platform.

### 4. Start the Services

Recommended on Windows:

```powershell
E:\apps\start-dev.bat
```

This starts:

- Web: `http://localhost:3000`
- Socket.IO: `http://localhost:4000/health`
- LiveKit: `ws://localhost:7880` when the local binary is available

You can also start the application services separately:

```powershell
pnpm dev:web
pnpm dev:server
```

If the pnpm wrapper or `PATH` is unavailable, run the actual entry point directly from the relevant application directory.

### 5. Health Checks

```powershell
Invoke-WebRequest http://localhost:3000/login
Invoke-WebRequest http://localhost:4000/health
Invoke-WebRequest http://localhost:7880/
```

The Socket health endpoint should return:

```json
{"status":"ok"}
```

---

## Environment Variables

### Web: `apps/web/.env`

| Variable | Required | Description |
|---|---:|---|
| `DATABASE_URL` | Yes | Prisma SQLite URL, for example `file:E:/apps/data/eduverse.db` |
| `NEXTAUTH_SECRET` | Yes | Auth.js signing secret with at least 32 random characters |
| `NEXTAUTH_URL` | Yes | `http://localhost:3000` for local development |
| `NEXT_PUBLIC_SOCKET_URL` | Yes | Socket service URL; `http://localhost:4000` locally |
| `SOCKET_TICKET_SECRET` | Yes | Secret for single-use Socket tickets; must match the server value |
| `ZENMUX_API_KEY` | When using AI tutors | Private ZenMux key; it must exist only in server-side environment variables |
| `ZENMUX_MODEL` | No | Default tutor model; currently recommended: `openai/gpt-5.6-luna` |
| `AI_BASE_URL` | For other server-side AI | OpenAI-compatible base URL, normally including `/v1` |
| `AI_MODEL` | Same as above | General server-side AI model ID |
| `AI_API_KEY` | Same as above | General server-side AI key |
| `LIVEKIT_URL` | For audio and video | HTTP/HTTPS address used by the server to access LiveKit |
| `NEXT_PUBLIC_LIVEKIT_URL` | For audio and video | `ws://` or `wss://` address used by browsers to access LiveKit |
| `LIVEKIT_API_KEY` | For audio and video | LiveKit API key |
| `LIVEKIT_API_SECRET` | For audio and video | LiveKit API secret |
| `UPLOAD_ROOT` | Recommended | Root directory for uploaded materials and browser recordings |

Variables prefixed with `NEXT_PUBLIC_*` are included in the browser bundle. Never use that prefix for a secret or third-party API key.

### Socket Server: `apps/server/.env`

| Variable | Required | Description |
|---|---:|---|
| `DATABASE_URL` | Yes | Must point to the same database as the Web service |
| `REDIS_URL` | Yes | Use `memory://` for single-machine development and real Redis in production |
| `SOCKET_TICKET_SECRET` | Yes | Must exactly match the Web service value |
| `WEB_ORIGINS` | Yes | Allowed Web origins; multiple origins may be configured as supported by the implementation |

### Generate a Secure Random Value

PowerShell example:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

Never commit `.env` files, databases, local LiveKit configuration, or API keys to Git.

---

## Database

### Default Database

Development mode uses SQLite:

```text
data/eduverse.db
```

The entire directory is ignored by Git because it may contain real accounts, password hashes, class records, invitations, chat histories, and upload paths.

### Prisma Schema

```text
packages/db/prisma/schema.prisma
```

Current business models include:

- `User`, `Class`, `Enrollment`, `Session`
- `EmotionLog`, `Message`, `Attendance`, `RewardLedger`
- `Material`, `ClassFile`, `WhiteboardEvent`
- `Quiz`, `Submission`
- `AgentMemory`
- `RolePlayScenario`, `RolePlayMessage`
- `Recording`, `TutoringSession`
- `ParentInvitation`, `ParentStudentLink`

### Schema Synchronization

For development, run:

```powershell
$env:DATABASE_URL = "file:E:/apps/data/eduverse.db"
pnpm exec prisma db push --schema packages/db/prisma/schema.prisma
pnpm db:generate
```

`db push` is suitable for prototype development but should not replace a production migration workflow.

### Manual SQL Migrations

The SQL files in `apps/database/migrations` are **not idempotent**. Run them in filename order and execute each file only once. Back up the database before applying a migration and maintain a migration record. Rollback should primarily restore a backup rather than attempt to remove newly added columns.

---

## AI Tutors and ZenMux

### Request Flow

```text
Student browser
  -> POST /api/ai/tutor (authenticated)
  -> packages/ai
  -> ZenMux OpenAI-compatible endpoint
  -> SSE upstream
  -> NDJSON same-origin stream
  -> browser incrementally updates answer
```

### Streaming Responses

- The model returns JSON with the `answer` field positioned near the beginning.
- The server incrementally accumulates JSON from SSE and extracts only the visible portion of `answer`.
- The browser updates the chat bubble whenever it receives an NDJSON `answer` event.
- Practice questions, answer explanations, and video keywords are added only after the complete JSON passes validation.
- The completed result is saved to the current tutor's own history bucket.
- Timeouts, network interruptions, an abnormal `finish_reason`, or a missing `[DONE]` marker cause the response to be marked as interrupted.
- Partial response text may remain visible after an interruption, but it is not saved or included in the next request's context.

### Model Selection

The interface displays only four product-approved models:

| UI Name | ZenMux Model ID |
|---|---|
| DeepSeek V4.1 Flash | `deepseek/deepseek-v4.1-flash` |
| Gemini 3.8 Flash | `google/gemini-3.8-flash` |
| GPT 5.6 Luna | `openai/gpt-5.6-luna` |
| GPT 5.6 Terra | `openai/gpt-5.6-terra` |

The selected option is stored in the current browser's localStorage. The server validates the value again and accepts only the four models above. A model appearing in the catalog does not guarantee that the account has permission to use it or that its upstream route is always available.

### Persist a ZenMux Key Securely

Do not paste a key into chat, issues, screenshots, or command arguments. Use the interactive script:

```powershell
& "C:\Users\ThinkBook\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" `
  "E:\apps\apps\web\scripts\configure-zenmux.cjs"
```

The script:

- Hides key input.
- Atomically updates `apps/web/.env`.
- Preserves all other environment variables.
- Does not print the key or create an additional secret backup.

Restart the Web service after changing the key.

### Related Videos

A complete AI response includes one to three short concept keywords. The Web service searches Bilibili's public search page for real videos, parses the title, BV identifier, thumbnail, duration, and author, and displays up to five results. This feature depends on an external page structure and may stop working when that platform changes. The current filtering is not a substitute for human review, so do not claim that every result has passed an educational safety review.

### Translator

The translator uses a separate WorkBuddy Cloud browser channel and does not automatically follow ZenMux tutor model changes. Its history currently remains in page memory and is not written to `AgentMemory`.

---

## Audio, Video, and Recording

### Local LiveKit

The basic local setup uses the native Windows LiveKit Server:

```text
apps/infra/media/bin/livekit-server.exe
apps/infra/media/livekit.local.yaml
```

Both files are ignored by Git: the binary is large, and the local YAML contains secrets.

### Browser Secure Context

During development, use:

```text
http://localhost:3000
```

Do not use a LAN HTTP address such as `http://192.168.x.x:3000`. Browsers expose `getUserMedia` only over HTTPS or on localhost. To use camera and microphone from another device, deploy over HTTPS and use LiveKit through `wss://`.

The Web response headers should allow device access for the same origin:

```text
Permissions-Policy: camera=(self), microphone=(self), geolocation=()
```

### Current Publishing Permissions

- Teachers can publish camera, microphone, and screen-share tracks.
- Regular students are subscribe-only and cannot publish camera or microphone tracks.
- Private tutoring participants may publish according to their token permissions.

### Browser-Side Recording

The current local solution does not depend on LiveKit Egress:

1. The teacher's browser draws participant video onto a Canvas.
2. `MediaRecorder` records a WebM file.
3. The file is uploaded to `UPLOAD_ROOT/recordings/...` when recording stops.
4. The database record changes to `COMPLETE`.
5. The playback route supports HTTP Range requests, allowing the player to seek.

The recorder uses a module-level registry so that it can survive component remounts. It updates a database heartbeat every 20 seconds, and stale `ACTIVE` records without a heartbeat are reclaimed. Navigating away from the classroom within the application attempts to save the recording automatically. A full-page crash or system power loss can still cause data loss, so production deployments should use server-side Egress.

### Complete Docker Media Stack

`apps/infra/media/docker-compose.yml` includes Redis, LiveKit, Egress, MinIO, and Caddy. See `apps/infra/media/README.md`. Shared YAML files in the repository may contain development placeholders only; replace every placeholder in production.

---

## Real-Time Classroom

### Socket Authentication

1. The Web application uses the authenticated session to request `/api/socket-ticket`.
2. The server issues a short-lived HMAC ticket.
3. The Socket server validates the signature, expiration time, and single-use `jti`.
4. When a user joins a classroom, the server checks the database again: the teacher must own the class, and the student must be enrolled.

Production deployments must use real Redis so that multiple instances can share ticket replay protection, presence, and classroom state. `memory://` is suitable only for single-process development.

### Main Real-Time Events

- Classroom join and leave events and participant lists.
- Classroom messages and chat history.
- Emotional feedback, raised hands, and teacher announcements.
- Whiteboard state and operations.
- Quiz start, answers, results, and completion.
- Role-play and one-to-one tutoring.
- Notifications when the class material list changes.
- Classroom completion.

Event types are defined centrally in `packages/shared/src/index.ts`. When changing an event, update both the server and client.

---

## Permissions and Roles

### User Roles

- `TEACHER`
- `STUDENT`
- `PARENT`

Each account has exactly one role. Selecting a portal does not change an existing account's role. If the account role and selected portal do not match, the user is prompted to sign out and use the correct account instead of being silently redirected to the student portal.

### Main Resource Permissions

| Resource | Teacher | Student | Parent |
|---|---|---|---|
| Class management | Classes created by the teacher | Join with a room code | None |
| Real-time classroom data | Classes owned by the teacher | Enrolled and class is live | None |
| Audio and video | Classes owned by the teacher | Enrolled; subscribe-only by default | None |
| Learning materials | Upload and download in owned classes | Download when enrolled | None |
| Recordings | Manage and publish for owned classes | View according to publishing policy | None |
| AI tutors | None | Personal use | None |
| Learning reports | Generate relevant data for class students | None | Linked children only |

---

## Internationalization

Interface locale files are located in:

```text
apps/web/src/lib/i18n/locales/
```

`zh.ts` is the source of truth for the dictionary key structure. TypeScript types enforce key completeness in every other locale. When adding interface text:

1. Add the key to the Chinese dictionary.
2. Add the corresponding translation to all seven other dictionaries.
3. Use `useI18n().t('path.key')` in the component.
4. Run the TypeScript checks.

The main application paths are internationalized. Some deeply nested classroom components and API error messages may still contain Chinese text. New features should continue replacing hard-coded interface strings with locale keys.

---

## Testing and Quality Checks

### Type Checking

```powershell
pnpm typecheck
```

If the root script cannot find `pnpm` because of the environment `PATH`, run the frontend TypeScript compiler directly:

```powershell
& "C:\path\to\node.exe" "E:\apps\apps\web\node_modules\typescript\bin\tsc" `
  --noEmit -p "E:\apps\apps\web\tsconfig.json"
```

### Backend Tests

```powershell
pnpm --filter server test
```

### Build

```powershell
pnpm --filter web build
pnpm --filter server build
```

### Browser and E2E Scripts

```text
apps/web/scripts/browser-smoke.mjs
apps/web/scripts/quiz-four-types-e2e.mjs
```

These scripts may require local services, test accounts, and browser CDP access. Do not run them directly against a production database.

### Recommended Pre-Commit Checks

```powershell
git diff --check
git status
git diff --cached
pnpm typecheck
```

Never print real API keys in command output, test reports, or screenshots.

---

## Deployment Recommendations

### Keep the Monorepo, Deploy Services Separately

A monorepo does not require a single process. Keep the monorepo while deploying these components separately:

- `apps/web`: Next.js Web application and APIs.
- `apps/server`: Socket.IO service.
- LiveKit: independent service.
- Redis: managed Redis.
- Database: production database. PostgreSQL is recommended, but a migration must be designed.
- Object storage: use S3-compatible storage for production recordings and learning materials.

### Production Requirements

- HTTPS and WSS.
- Replace all development secrets and establish a secret-rotation process.
- Use real Redis; do not use `memory://`.
- Do not share a SQLite file across multiple stateless instances.
- Restrict uploaded file types and sizes and add malware scanning.
- Add AI request quotas, cost controls, timeouts, auditing, and content-safety controls.
- Establish an allowlist or human-review process for external video sources.
- Redact logs and never record keys, passwords, complete tokens, or sensitive information about minors.
- Establish data backups, recovery drills, and migration records.
- Define retention periods, access auditing, and deletion procedures for recordings and student data.

---

## Security Considerations

- `.env` files, databases, upload directories, and local LiveKit secrets are excluded through `.gitignore`.
- `apps/web/scripts/configure-zenmux.cjs` hides input, but `.env` remains a plaintext secret file on disk.
- A Socket ticket is a short-lived, single-use credential and must not replace database authorization checks.
- Parent invitation tokens are stored as hashes and are constrained by an email address, expiration time, and redemption status.
- New class passwords use bcrypt; legacy plaintext passwords migrate to hashes after a successful join.
- Structured AI output must pass Zod validation. Interrupted stream content does not enter history or subsequent context.
- Model IDs must exist in the server-side curated list. Never trust an arbitrary model ID received from the browser.

If a key has appeared in chat, a screenshot, commit history, or public logs, revoke it immediately in the provider console and generate a replacement.

---

## Troubleshooting

### 1. No Camera or Microphone Permission Prompt

Check the following:

- The address must be `http://localhost:3000` or HTTPS.
- `Permissions-Policy` must allow `camera=(self), microphone=(self)`.
- Edge or Chrome site settings must not block localhost.
- Windows privacy settings must allow desktop applications to access the camera and microphone.
- Another conferencing application must not be holding the device exclusively.

### 2. A Safe-Delete Error Appears When Starting Next.js Development Mode

Some protected environments prevent Next.js from deleting a large number of `.next` files. Do not bypass the protection. **Rename and back up** the old `.next` directory, then restart Next.js to generate a fresh cache. `.next.backup-*` is already ignored by Git.

### 3. Tailwind Reports That `border-border` Does Not Exist

Next.js was probably started from the wrong working directory, preventing Tailwind from locating its configuration. Start the process from `apps/web`, or make sure its working directory points there.

### 4. Prisma Reports a Native Engine Platform Mismatch

Remove or move dependencies copied from another operating system, reinstall them on the current system, and run:

```powershell
pnpm db:generate
```

### 5. An AI Tutor Appears Configured but Cannot Answer

- Confirm that the ZenMux key is valid and the account has sufficient balance.
- Confirm that the selected model is available to the account.
- Review the ZenMux request logs.
- A `500 internal_server_error` may indicate an upstream routing issue that restarting local services will not resolve.
- The curated list contains four models, but this does not guarantee that all four are always available.

### 6. A Streamed Answer Stops Halfway Through

The message is marked as "Partial content not saved" and does not contaminate history. Common causes include an upstream timeout, network interruption, abnormal `finish_reason`, missing `[DONE]`, or invalid final JSON. Ask the question again, and do not treat the partial answer as a validated result.

### 7. A Student Cannot See Materials Uploaded by the Teacher

Confirm that the student is enrolled and has successfully joined the Socket room. After the teacher uploads a file, the client broadcasts `class-files-changed`, and the student requests the file list again. If the broadcast fails, polling and manual refresh remain available as fallbacks.

### 8. A Recording Is Black or Cannot Be Saved

- Turn on the camera first and confirm that a video preview appears on the page.
- Even without a video track, the recorder should capture a placeholder rather than a completely black frame.
- Keep the classroom tab open.
- Check `UPLOAD_ROOT` permissions and available disk space.
- Check the database for recording records that have remained without a heartbeat for an extended period.

### 9. A Student Cannot Turn On the Camera or Microphone

This is the current product policy: regular classroom students receive subscribe-only tokens. Allowing students to publish requires a product-permission change and a new assessment of classroom moderation and recording layout.

### 10. What Is `E:\apps\AgenticEduverse`?

It is the empty sub-repository directory created before the Git metadata was moved. The Git root is now `E:\apps`. The empty directory is ignored; do not copy the project into it again.

---

## Git Workflow

Repository root:

```text
E:\apps
```

Current branch: `main`.

Recommended workflow:

```powershell
git status
git switch -c feature/<short-name>
# edit + test
git add <specific-files>
git diff --cached
git commit -m "Describe the change"
```

Before configuring or using a remote, confirm the repository visibility and inspect the project for sensitive information again:

```powershell
git remote -v
git push -u origin main
```

Do not force-push, do not commit `.env`, and do not use `git add -f` to bypass ignore rules.

---

## Project Scope

The current implementation supports a complete local demonstration, but the following items remain production-readiness work:

- Multi-instance Socket/Redis deployment and database high availability.
- Server-side LiveKit Egress, reliable transcoding, and object storage.
- Complete internationalization of every deeply nested page and API message.
- Video recommendation moderation and a stable official API.
- AI cost controls, content review, model fallback, and provider SLAs.
- Mobile clients, accessibility, weak-network optimization, and formal load testing.
- Privacy for minors, regional legal compliance, and school data-governance procedures.

---

## License and Contributing

The current `package.json` is marked as private, and the repository does not declare an open-source license. Do not publish it publicly or reproduce it as an open-source project without confirmation from the project owner.

Before submitting a feature, make sure that:

1. Requirements and role permissions are clearly defined.
2. Shared client/server types are synchronized.
3. Type checks and relevant tests pass.
4. The change contains no secrets, databases, or personal data.
5. The README or related documentation is updated whenever behavior changes.
