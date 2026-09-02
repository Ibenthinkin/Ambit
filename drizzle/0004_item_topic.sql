CREATE TABLE "item_topic" (
	"item_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"origin" text NOT NULL,
	CONSTRAINT "item_topic_item_id_topic_id_pk" PRIMARY KEY("item_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "item" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "item_topic" ADD CONSTRAINT "item_topic_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_topic" ADD CONSTRAINT "item_topic_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_item_topic_topic" ON "item_topic" USING btree ("topic_id");--> statement-breakpoint
-- Cut 1 backfill (docs/DESIGN_topic-vocabulary-growth.md §5): exactly one membership row per
-- existing item, taken from the column the feed has always read. `origin` records how that topic
-- was decided — a walk source's rows came from the curator's classify mode (Phase 6.3), every
-- other source's from the seed query that surfaced the item. The walk-source list is frozen
-- here on purpose: a migration is a record of what was true when it ran, not a reader of live
-- config. (streetartnews is present locally from its 09-02-26 trial branch; production has none.)
INSERT INTO "item_topic" ("item_id", "topic_id", "origin")
SELECT "id",
       "topic_id",
       CASE
         WHEN "source" IN ('doorofperception', 'thingsorganizedneatly', 'mossandfog', 'thisiscolossal', 'streetartnews')
           THEN 'curator'
         ELSE 'seed'
       END
FROM "item"
WHERE "topic_id" IS NOT NULL
ON CONFLICT DO NOTHING;
