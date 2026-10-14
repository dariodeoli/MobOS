-- Segundo factor del panel de plataforma (PIN del dueño). Aditiva e idempotente.
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "superadminVerifiedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "SuperadminPinGuard" (
  "userId" TEXT NOT NULL,
  "failures" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "lockedUntil" TIMESTAMP(3),
  CONSTRAINT "SuperadminPinGuard_pkey" PRIMARY KEY ("userId")
);
