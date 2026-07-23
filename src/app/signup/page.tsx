"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUp } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";

function SignupForm() {
  const [state, action] = useActionState(signUp, undefined);
  const next = useSearchParams().get("next") ?? "";
  return (
    <div className="card w-full max-w-sm p-8">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="text-muted text-sm mt-1 mb-6">Start your free workspace in seconds.</p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input className="input" id="name" name="name" type="text" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          <p className="text-xs text-muted mt-1">At least 8 characters.</p>
        </div>
        {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
        <SubmitButton pendingText="Creating…">Create account</SubmitButton>
      </form>
      <p className="text-sm text-muted mt-6">
        Already have an account? <Link href="/login" className="text-primary font-medium">Sign in</Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Suspense>
        <SignupForm />
      </Suspense>
    </div>
  );
}
