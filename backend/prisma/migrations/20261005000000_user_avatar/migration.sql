-- Foto de perfil del usuario (cronologías y equipo).
CREATE TABLE "UserAvatar" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storageKey" TEXT,
  "data" BYTEA,
  "mimeType" TEXT NOT NULL,
  "sha256" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserAvatar_userId_key" ON "UserAvatar"("userId");
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
