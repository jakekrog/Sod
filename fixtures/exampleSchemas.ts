/**
 * The schema source for Sod's compiled test fixture.
 *
 * This is an ordinary consumer schema module — exactly what a Sod user writes.
 * `scripts/build-fixture.mjs` compiles it the way a consumer would (esbuild,
 * Zod external), and the suite runs the compiled output. That's the point: a
 * hand-written JS fixture would silently pass even if real bundler output
 * couldn't load, because it never goes through a bundler.
 *
 * It deliberately covers what's hard rather than what's typical:
 *   - `superRefine` — logic no JSON Schema or generated Swift struct can express
 *   - a nested object — multi-segment issue paths
 *   - an array — `PathComponent.index` vs a key named "0"
 *   - an enum — a plain structural check, as a control
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
