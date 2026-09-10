// `bun run seed:personas` — see services/persona-seed.ts. The password is PERSONA_PASSWORD from
// the environment (Mac: .env; production: Coolify's environment), never a default: twenty
// accounts with a guessable password on a public host is not a test fixture, it is a hole.
import { seedPersonas } from "~/server/services/persona-seed";

const password = process.env.PERSONA_PASSWORD;
if (!password || password.length < 12) {
  console.error(
    "PERSONA_PASSWORD is unset or under 12 characters — refusing to seed.",
  );
  process.exit(1);
}

const r = await seedPersonas({ password });
console.log(
  `personas: ${r.created.length} created, ${r.updated.length} updated, ${r.unchanged.length} unchanged.`,
);
if (r.created.length) console.log(`  created: ${r.created.join(", ")}`);
if (r.updated.length) console.log(`  updated: ${r.updated.join(", ")}`);
console.log("Sign in as persona-<slug>@ambit.local with the shared password.");
process.exit(0);
