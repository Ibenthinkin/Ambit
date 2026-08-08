CREATE TABLE "seen_item" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"served_at" timestamp with time zone NOT NULL,
	CONSTRAINT "seen_item_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "seen_item" ADD CONSTRAINT "seen_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_item" ADD CONSTRAINT "seen_item_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;