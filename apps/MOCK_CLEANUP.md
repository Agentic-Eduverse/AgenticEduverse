# Production mock cleanup

The production source under `apps/web/src`, `apps/server/src` and `packages/*/src` has no standalone `mock`, `demo`, Faker, preset-question, preset-student or template-reply implementation.

| Surface | Previous source | Current source | Persistence / verification |
| --- | --- | --- | --- |
| Teacher, student and parent entry pages | Independent visual/demo pages | Redirect to the authenticated real dashboard | Auth.js session and SQLite user role; browser smoke test |
| Live-class entry | Example live classroom without a selected class | Dashboard/class selection | `Class`, `Enrollment`, `Session`; browser smoke test |
| Classroom participants | Hard-coded teacher/students | Signed Socket identity plus Redis presence | Socket ticket, membership check, multi-tab connection set |
| Quiz | Fixed questions and generated rankings | Empty manual editor, saved drafts, reviewed AI draft | `Quiz`, `Submission`, `RewardLedger`; unit/type/browser tests |
| Tutor | Preset conversation titles and fallback reply | Persisted student history and configured model only | `AgentMemory`; unconfigured model returns 503 |
| Analytics | Fixed percentages, focus curve and AI suggestion | Attendance/message/emotion/submission aggregation | `Session`, `Attendance`, `Message`, `EmotionLog`, `Submission` |
| Parent dashboard | Fabricated weekly KPI cards | Authorized child records and nullable aggregates | `ParentStudentLink`; isolated parent browser session |
| Role-play | Scripted messages | Teacher-authored scenarios and persisted participant messages | `RolePlayScenario`, `RolePlayMessage` |
| Whiteboard/chat/files | Local-only or example state | Per-class persisted events/messages/files | SQLite plus authorization checks |
| Media/recording status | Local visual toggles | LiveKit/Egress confirmation or explicit unconfigured/error state | LiveKit/MinIO when configured |

Existing unmarked preview records are retained but are not returned to students. Only records with a teacher `publishedAt` marker are visible. Existing quizzes remain drafts after migration and are never auto-started. No historical row is deleted or classified by its title.
