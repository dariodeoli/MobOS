ALTER TABLE "McpChangePreview" ADD COLUMN "before" JSONB;
ALTER TABLE "McpChangePreview" ADD COLUMN "after" JSONB;
ALTER TABLE "McpChangePreview" ADD COLUMN "resultEntity" TEXT;
ALTER TABLE "McpChangePreview" ADD COLUMN "resultId" TEXT;
