ALTER TABLE "McpClientGrant" ADD COLUMN "userId" TEXT;
UPDATE "McpClientGrant" g SET "userId" = c."userId"
FROM "McpAuthorizationCode" c
WHERE c."grantId" = g."id" AND g."userId" IS NULL;
UPDATE "McpClientGrant" SET "userId" = (SELECT "id" FROM "User" u WHERE u."tenantId" = "McpClientGrant"."tenantId" ORDER BY u."createdAt" ASC LIMIT 1)
WHERE "userId" IS NULL;
ALTER TABLE "McpClientGrant" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "McpClientGrant" ADD CONSTRAINT "McpClientGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "McpClientGrant_tenantId_userId_idx" ON "McpClientGrant"("tenantId", "userId");
