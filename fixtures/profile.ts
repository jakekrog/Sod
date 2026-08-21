/** Profile schema fixture — optional, nullish, default. */
import { z } from "zod";

export const Profile = z.object({
  displayName: z.string().min(1),
  bio: z.string().optional(),
  avatarUrl: z.string().url().nullish(),
  theme: z.enum(["light", "dark"]).default("light"),
});
