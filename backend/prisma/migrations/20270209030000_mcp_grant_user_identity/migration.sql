DROP INDEX IF EXISTS "McpClientGrant_accountId_tenantId_clientId_redirectUri_key";
CREATE UNIQUE INDEX "McpClientGrant_accountId_tenantId_userId_clientId_redirectUri_key" ON "McpClientGrant"("accountId", "tenantId", "userId", "clientId", "redirectUri");
