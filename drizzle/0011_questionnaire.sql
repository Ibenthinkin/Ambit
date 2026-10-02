CREATE TABLE "interview_answer" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"run_id" text NOT NULL,
	"question_id" text NOT NULL,
	"answer" text[] DEFAULT '{}'::text[] NOT NULL,
	"text" text,
	"bank_version" integer NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "writing_amount" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "age_range" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "interview_answer" ADD CONSTRAINT "interview_answer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_interview_answer_user" ON "interview_answer" USING btree ("user_id");