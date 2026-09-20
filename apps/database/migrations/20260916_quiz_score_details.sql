-- Preserve percentage score while recording weighted raw score details for new submissions.
-- Existing rows remain nullable; this migration intentionally does not guess their historical units.
ALTER TABLE "Submission" ADD COLUMN "rawScore" INTEGER;
ALTER TABLE "Submission" ADD COLUMN "totalPoints" INTEGER;
ALTER TABLE "Submission" ADD COLUMN "correctCount" INTEGER;
