CREATE TABLE "McpClientGrant" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "McpClientGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "McpClientGrant_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "McpClientGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "McpClientGrant_accountId_tenantId_clientId_redirectUri_key" ON "McpClientGrant"("accountId", "tenantId", "clientId", "redirectUri");
CREATE INDEX "McpClientGrant_tenantId_clientId_revokedAt_idx" ON "McpClientGrant"("tenantId", "clientId", "revokedAt");

CREATE TABLE "McpAuthorizationCode" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpAuthorizationCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "McpAuthorizationCode_codeHash_key" UNIQUE ("codeHash"),
  CONSTRAINT "McpAuthorizationCode_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "McpClientGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "McpAuthorizationCode_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "McpAuthorizationCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "McpAuthorizationCode_grantId_expiresAt_usedAt_idx" ON "McpAuthorizationCode"("grantId", "expiresAt", "usedAt");
CREATE INDEX "McpAuthorizationCode_tenantId_clientId_idx" ON "McpAuthorizationCode"("tenantId", "clientId");

CREATE TABLE "McpAccessToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "refreshTokenHash" TEXT,
  "grantId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "refreshExpiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "rotatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "McpAccessToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "McpAccessToken_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "McpAccessToken_refreshTokenHash_key" UNIQUE ("refreshTokenHash"),
  CONSTRAINT "McpAccessToken_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "McpClientGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "McpAccessToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "McpAccessToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "McpAccessToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "McpAccessToken_tenantId_clientId_revokedAt_idx" ON "McpAccessToken"("tenantId", "clientId", "revokedAt");
CREATE INDEX "McpAccessToken_sessionId_revokedAt_idx" ON "McpAccessToken"("sessionId", "revokedAt");
