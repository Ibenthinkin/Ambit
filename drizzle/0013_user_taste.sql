CREATE TABLE "user_taste" (
	"user_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"bank_version" integer NOT NULL,
	"taste" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_taste" ADD CONSTRAINT "user_taste_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;