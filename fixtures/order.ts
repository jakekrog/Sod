/**
 * Order schema fixture — superRefine, nested objects, arrays, enums.
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
