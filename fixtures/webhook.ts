/** Webhook schema fixture — discriminatedUnion. */
import { z } from "zod";

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
