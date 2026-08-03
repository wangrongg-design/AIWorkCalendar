CREATE TYPE "RuntimeLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

CREATE TABLE "runtime_logs" (
  "id" TEXT NOT NULL,
  "level" "RuntimeLogLevel" NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'api',
  "tenant_id" TEXT,
  "user_id" TEXT,
  "method" TEXT,
  "path" TEXT,
  "status_code" INTEGER,
  "request_id" TEXT,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "ip" TEXT,
  "user_agent" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "runtime_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "runtime_logs_level_created_at_idx" ON "runtime_logs"("level", "created_at");
CREATE INDEX "runtime_logs_tenant_id_created_at_idx" ON "runtime_logs"("tenant_id", "created_at");
CREATE INDEX "runtime_logs_path_created_at_idx" ON "runtime_logs"("path", "created_at");
