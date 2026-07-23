"use client";

import { useActionState, useEffect, useRef } from "react";
import { addProject } from "@/app/actions/projects";
import { SubmitButton } from "./submit-button";

export function AddProjectForm({ disabled }: { disabled?: boolean }) {
  const [state, action] = useActionState(addProject, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the input after a successful add (no error returned).
  useEffect(() => {
    if (state === undefined) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          className="input"
          name="name"
          placeholder="New project name"
          required
          disabled={disabled}
        />
        <SubmitButton pendingText="Adding…">Add</SubmitButton>
      </div>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
