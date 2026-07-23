"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  hashPassword,
  verifyPassword,
  createSession,
  setSessionCookie,
  signOut as doSignOut,
} from "@/lib/auth";

const credentials = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

export type FormState = { error?: string } | undefined;

// Only allow relative in-app redirects, never an attacker-supplied absolute URL.
function safeNext(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : null;
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const email = parsed.data.email.toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing.length > 0) return { error: "An account with that email already exists" };

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: hashPassword(parsed.data.password), name: parsed.data.name || null })
    .returning();
  const token = await createSession(user.id);
  await setSessionCookie(token);
  redirect(safeNext(formData.get("next")) ?? "/onboarding");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required" };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Same generic message whether the email is unknown or the password is wrong,
  // so the form doesn't reveal which emails have accounts.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid email or password" };
  }
  const token = await createSession(user.id);
  await setSessionCookie(token);
  redirect(safeNext(formData.get("next")) ?? "/dashboard");
}

export async function signOut(): Promise<void> {
  await doSignOut();
  redirect("/login");
}
