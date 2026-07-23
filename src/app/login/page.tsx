"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";

function LoginForm() {
  const [state, action] = useActionState(signIn, undefined);
  const next = useSearchParams().get("next") ?? "";
  return (
    <div className="card w-full max-w-sm p-8">
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="text-muted text-sm mt-1 mb-6">Sign in to your workspace.</p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
        <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      </form>
      <p className="text-sm text-muted mt-6">
        No account? <Link href="/signup" className="text-primary font-medium">Create one</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
