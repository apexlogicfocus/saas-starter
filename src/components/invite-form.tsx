"use client";

import { useActionState, useState } from "react";
import { invite } from "@/app/actions/members";
import { SubmitButton } from "./submit-button";

export function InviteForm() {
  const [state, action] = useActionState(invite, undefined);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-col sm:flex-row gap-2">
        <input className="input" name="email" type="email" placeholder="teammate@company.com" required />
        <select className="input sm:w-40" name="role" defaultValue="member">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <SubmitButton pendingText="Inviting…">Send invite</SubmitButton>
      </form>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.url && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-xs text-muted mb-1">
            Invite created. Share this link (email delivery isn&apos;t wired up in the demo):
          </p>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" readOnly value={state.url} />
            <button
              type="button"
              className="btn-ghost text-xs px-3"
              onClick={() => {
                navigator.clipboard.writeText(state.url!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
