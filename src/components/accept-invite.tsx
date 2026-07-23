"use client";

import { useActionState } from "react";
import { accept } from "@/app/actions/members";
import { SubmitButton } from "./submit-button";

export function AcceptInvite({ token }: { token: string }) {
  const [state, action] = useActionState(accept, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      <SubmitButton className="btn-primary w-full" pendingText="Joining…">
        Accept invitation
      </SubmitButton>
    </form>
  );
}
