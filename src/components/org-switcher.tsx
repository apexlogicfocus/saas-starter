"use client";

import { switchOrg } from "@/app/actions/org";

export function OrgSwitcher({
  orgs,
  activeId,
}: {
  orgs: { id: string; name: string }[];
  activeId: string;
}) {
  if (orgs.length <= 1) {
    return <div className="font-semibold truncate">{orgs[0]?.name}</div>;
  }
  return (
    <form action={switchOrg}>
      <select
        name="orgId"
        defaultValue={activeId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="input font-medium"
        aria-label="Switch organization"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </form>
  );
}
