CREATE TABLE "ingest_run" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"exit_code" integer NOT NULL,
	"inserted" integer NOT NULL,
	"dry_run" boolean NOT NULL,
	"per_source" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "idx_ingest_run_finished_at" ON "ingest_run" USING btree ("finished_at");