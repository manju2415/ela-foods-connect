import { z } from "zod";

/** Internal placeholder domain used for phone-based auth accounts. */
const PLACEHOLDER_DOMAIN = "@elabazar.local";

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: "Email address is required" })
  .email({ message: "Please enter a valid email address" })
  .max(255, { message: "Email must be less than 255 characters" });

/** True when the email is an internal placeholder (not a real, contactable address). */
export const isPlaceholderEmail = (email?: string | null): boolean =>
  !!email && email.toLowerCase().endsWith(PLACEHOLDER_DOMAIN);

/** Returns the email only when it is a real address, otherwise an empty string. */
export const realEmailOrEmpty = (email?: string | null): string =>
  email && !isPlaceholderEmail(email) ? email : "";

/** Validates an email, returning the trimmed value or an error message. */
export const validateEmail = (email: string): { value?: string; error?: string } => {
  const result = emailSchema.safeParse(email);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Please enter a valid email address" };
  }
  return { value: result.data };
};
