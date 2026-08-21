/** CatalogItem schema fixture — transform. */
import { z } from "zod";

export const CatalogItem = z.object({
  slug: z.string().min(1).transform((value) => value.trim().toLowerCase()),
  title: z.string().min(1),
});
