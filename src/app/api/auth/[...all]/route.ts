// Catch-all route: every Better Auth endpoint (sign-up, sign-in, sign-out, session, password
// reset, ...) lives under /api/auth/*. `toNextJsHandler` turns the single `auth` instance into
// the GET/POST handlers this route file is required to export — Better Auth owns the entire
// request/response shape for these paths, this file just wires it into the App Router.
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "~/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
