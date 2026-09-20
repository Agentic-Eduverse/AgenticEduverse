ALTER TABLE "Recording" ADD COLUMN "whiteboardStart" JSONB;
ALTER TABLE "Recording" ADD COLUMN "publishedAt" DATETIME;

CREATE TABLE "TutoringSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "classId" TEXT NOT NULL,
  "sessionId" TEXT,
  "teacherId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" DATETIME,
  CONSTRAINT "TutoringSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TutoringSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TutoringSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TutoringSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TutoringSession_classId_status_idx" ON "TutoringSession"("classId", "status");
CREATE INDEX "TutoringSession_studentId_status_idx" ON "TutoringSession"("studentId", "status");
CREATE INDEX "TutoringSession_teacherId_status_idx" ON "TutoringSession"("teacherId", "status");
