"use client";

import { useActionState } from "react";
import { createOrg } from "@/app/actions/org";
import { SubmitButton } from "@/components/submit-button";

export default function OnboardingPage() {
  const [state, action] = useActionState(createOrg, undefined);
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="text-2xl font-semibold">Create your organization</h1>
        <p className="text-muted text-sm mt-1 mb-6">
          This is your workspace — you can invite teammates and manage billing per organization.
        </p>
        <form action={action} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">Organization name</label>
            <input className="input" id="name" name="name" type="text" placeholder="Acme Inc." required />
          </div>
          {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
          <SubmitButton pendingText="Creating…">Create organization</SubmitButton>
        </form>
      </div>
    </div>
  );
}
