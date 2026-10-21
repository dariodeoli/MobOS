DROP INDEX IF EXISTS "McpClientGrant_accountId_tenantId_userId_clientId_redirectUri_key";
DROP INDEX IF EXISTS "McpClientGrant_accountId_tenantId_clientId_redirectUri_key";
ALTER TABLE "McpClientGrant" ALTER COLUMN "accountId" DROP NOT NULL;
ALTER TABLE "McpAuthorizationCode" ALTER COLUMN "accountId" DROP NOT NULL;
ALTER TABLE "McpAccessToken" ALTER COLUMN "accountId" DROP NOT NULL;
CREATE UNIQUE INDEX "McpClientGrant_tenantId_userId_clientId_redirectUri_key" ON "McpClientGrant"("tenantId", "userId", "clientId", "redirectUri");
