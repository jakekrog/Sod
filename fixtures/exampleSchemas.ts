/**
 * The schema source for Sod's compiled test fixture.
 *
 * This is an ordinary consumer schema module — exactly what a Sod user writes.
 * `npm run build` (via `@sod/build` and `sod.config.js`) compiles it the way a
 * consumer would (esbuild, Zod external), and the suite runs the compiled output.
 * That's the point: a hand-written JS fixture would silently pass even if real
 * bundler output couldn't load, because it never goes through a bundler.
 *
 * Each export exercises a different Zod capability through the bundler pipeline:
 *   - Order — superRefine, nested objects, arrays, enums
 *   - CatalogItem — transform
 *   - Webhook — discriminatedUnion
 *   - Profile — optional, nullable, default
 */
import { z } from "zod";

/** Minor-unit precision per currency, so the rule is real rather than a toy. */
const CURRENCY_DIGITS: Record<string, number> = { USD: 2, EUR: 2, JPY: 0, KWD: 3 };

const Money = z
  .object({
    value: z.number().nonnegative(),
    currency: z.string(),
  })
  .superRefine((money, ctx) => {
    const digits = CURRENCY_DIGITS[money.currency];
    if (digits === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["currency"],
        message: `"${money.currency}" is not a supported currency`,
      });
      return;
    }
    const scaled = money.value * 10 ** digits;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `${money.currency} allows at most ${digits} decimal place(s)`,
      });
    }
  });

export const Order = z.object({
  reference: z.string().min(1),
  status: z.enum(["draft", "placed", "shipped"]),
  total: Money,
  lines: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const CatalogItem = z.object({
  slug: z.string().min(1).transform((value) => value.trim().toLowerCase()),
  title: z.string().min(1),
});

export const Webhook = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("user.created"),
    userId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("order.paid"),
    orderId: z.string().min(1),
    amount: z.number().positive(),
  }),
]);

export const Profile = z.object({
  displayName: z.string().min(1),
  bio: z.string().optional(),
  avatarUrl: z.string().url().nullish(),
  theme: z.enum(["light", "dark"]).default("light"),
});
