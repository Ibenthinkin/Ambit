import { notFound } from "next/navigation";

import { MarksBench } from "~/components/dev/marks-bench";
import { feedDebugEnabled } from "~/server/services/feed-debug";

// Ben picks the profile mark here (docs/DESIGN_landing-redo.md D7). Same gate as /dev/feed — under
// a production build with FEED_DEBUG unset this is a 404. No session guard: nothing here is a
// reader's data, only six made-up ids.
export default async function DevMarksPage() {
  if (!(await feedDebugEnabled())) notFound();
  return <MarksBench />;
}
