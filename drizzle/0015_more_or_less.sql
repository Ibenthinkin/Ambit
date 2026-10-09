CREATE TABLE "item_feedback" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"verdict" text NOT NULL,
	"topic_id" text,
	"weight_applied" real DEFAULT 0 NOT NULL,
	"cool_applied" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_feedback_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "user_topic_cool" (
	"user_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"cool" real NOT NULL,
	CONSTRAINT "user_topic_cool_user_id_topic_id_pk" PRIMARY KEY("user_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "item_feedback" ADD CONSTRAINT "item_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_feedback" ADD CONSTRAINT "item_feedback_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_feedback" ADD CONSTRAINT "item_feedback_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topic_cool" ADD CONSTRAINT "user_topic_cool_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topic_cool" ADD CONSTRAINT "user_topic_cool_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_item_feedback_user" ON "item_feedback" USING btree ("user_id");