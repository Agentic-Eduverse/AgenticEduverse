# Real-data and risk remediation summary

Implemented changes include authenticated real-only entry pages, signed one-time Socket tickets, Redis-backed presence, persisted attendance/chat/whiteboard/files, explicit class start/end lifecycle, manual and reviewed-AI quiz drafts, shared weighted scoring, idempotent rewards, factual student/parent/teacher statistics, secure parent invitations, real Tutor history, role-play privacy/lifecycle, lazy-loaded LiveKit media, and scoped light-theme contrast fixes.

The media source now includes restricted one-to-one tutoring rooms, main-room-only Egress, signed webhook status updates, authenticated HTTP range playback, teacher publication and synchronized immutable whiteboard replay. Actual media-device validation remains environment-dependent.

High-risk fixes found during runtime validation:

- removed external Google Font fetching that blocked local cold starts;
- restarted stale Prisma processes and verified the new `ClassFile` model on a cold runtime;
- added missing Suspense boundaries that broke production prerendering;
- connected the student hand-raise button to the server and removed fake “call connected” state;
- prevented HTTP submissions to draft/expired quizzes and unified HTTP/Socket scoring;
- stopped returning every role’s secret task to students;
- fixed all four quiz answer controls, weighted raw-score persistence and post-end personal result/explanation access;
- replaced `crypto.randomUUID()`-only client IDs so LAN HTTP users can add quiz questions;
- cleared stale objective-question options when switching a draft to short-answer mode;
- removed preset Tutor history and pseudo-streamed fixed UI behavior;
- replaced the entire fixed analytics page with database facts and empty states;
- split LiveKit into a configuration-gated dynamic chunk, reducing classroom first-load JS from about 294 kB to about 155 kB in the production build.

See `MOCK_CLEANUP.md`, `VALIDATION_REPORT.md`, `LOCAL_PERSISTENCE.md`, `database/README.md` and `infra/media/README.md` for audit, tests and operations.
