import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

// The last scrap of the t3 scaffold's demo router: a pure, DB-free procedure the homepage still
// calls (src/app/page.tsx). Its `create`/`getLatest` siblings hit the placeholder `post` table,
// which Phase 2.1 removed from schema.ts in favor of the real Ambit tables — this whole router
// (and the homepage) is due to be replaced by the real feed UI in Phase 5.
export const postRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}`,
      };
    }),
});
