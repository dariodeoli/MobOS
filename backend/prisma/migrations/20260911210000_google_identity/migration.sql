CREATE TABLE "GoogleIdentity" (
  "subject" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  CONSTRAINT "GoogleIdentity_pkey" PRIMARY KEY ("subject"),
  CONSTRAINT "GoogleIdentity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoogleIdentity_tenantId_key" ON "GoogleIdentity"("tenantId");
