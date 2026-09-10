ALTER TABLE "topic" ALTER COLUMN "tier" SET DEFAULT 'original';--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "facet" text;--> statement-breakpoint
-- 09-10-26: the tier `core` is renamed `original` (docs/DESIGN_topic-facets-and-personas.md,
-- decision 4). Data move, so drizzle could not generate it; the type and default above follow.
UPDATE "topic" SET "tier" = 'original' WHERE "tier" = 'core';
