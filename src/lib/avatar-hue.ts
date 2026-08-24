// The avatar's color, derived from the user id (Phase 5.10).
//
// Ambit has no avatar upload and never will in this shape — the design has no file picker for one,
// and an invite-only app with no social surface has nobody to show a photograph to. What it has
// instead is a gradient disc, and this file is what stops that disc being the *same* disc for
// everyone: hash the user id, map it onto the color wheel, and every account gets its own.
//
// **Deterministic, not random, and not stored.** A random hue would need a column, a migration and
// a backfill, and would still differ between a signed-out preview and the real thing. A hash of the
// id is stable across sessions, devices and reinstalls for free, and can be computed anywhere the
// id is known — including in a test, which is why the screen tests can assert the exact gradient
// string rather than merely "some gradient".
//
// A pure module on purpose: no React, no DOM, no imports. `AvatarChip` takes the string as a prop.

/**
 * FNV-1a, 32-bit. A non-cryptographic hash chosen for exactly two properties: it avalanches well
 * enough that ids sharing a prefix (nanoid's alphabet clusters more than you'd think) land far
 * apart on the wheel, and it is short enough to read in one sitting. `>>> 0` after the multiply
 * keeps the arithmetic in unsigned 32-bit territory — JavaScript's `*` would otherwise drift into
 * float precision and make the result platform-dependent.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // The FNV prime (16777619), expressed as shifts+adds because a plain multiply overflows the
    // 53-bit float mantissa and loses the low bits that carry all the entropy.
    hash =
      (hash +
        ((hash << 1) +
          (hash << 4) +
          (hash << 7) +
          (hash << 8) +
          (hash << 24))) >>>
      0;
  }
  return hash >>> 0;
}

/** A stable hue in [0, 359] for a user id. */
export function avatarHue(userId: string): number {
  return fnv1a(userId) % 360;
}

/**
 * The disc's background: a two-stop `linear-gradient` at the prototype's 150° angle, light stop to
 * mid stop, both on the same hue.
 *
 * Saturation and lightness are fixed rather than derived, which is the point — the *hue* is what
 * varies per user, so every avatar in the app has the same weight and legibility against the app's
 * near-black ground, and no unlucky id gets a muddy or blinding disc. The second stop's hue is
 * nudged +18° so the gradient reads as a gradient rather than a flat wash.
 *
 * Returned as a CSS string for an inline `style`, not a class: a generated `bg-[…]` utility can't
 * exist at build time, and a custom `bg-*` class would need registering with tailwind-merge's
 * `bg-image` group to survive sitting next to another `bg-*` (the trap `.bg-avatar-gradient` was
 * created to solve — see `avatar-chip.tsx`). Inline style sidesteps both.
 */
export function avatarGradient(userId: string): string {
  const hue = avatarHue(userId);
  const second = (hue + 18) % 360;
  return `linear-gradient(150deg, hsl(${hue} 62% 72%), hsl(${second} 54% 46%))`;
}
