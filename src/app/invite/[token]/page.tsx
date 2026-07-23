import Link from "next/link";
import { getInvitePreview } from "@/lib/services/members";
import { getCurrentUser } from "@/lib/auth";
import { AcceptInvite } from "@/components/accept-invite";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [preview, user] = await Promise.all([getInvitePreview(token), getCurrentUser()]);

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8 text-center">
        {!preview ? (
          <>
            <h1 className="text-xl font-semibold">Invite not found</h1>
            <p className="text-muted text-sm mt-2">This invitation link is invalid.</p>
          </>
        ) : !preview.valid ? (
          <>
            <h1 className="text-xl font-semibold">Invite unavailable</h1>
            <p className="text-muted text-sm mt-2">{preview.reason}</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Join {preview.orgName}</h1>
            <p className="text-muted text-sm mt-2 mb-6">
              You&apos;ve been invited as a <strong>{preview.role}</strong>.
            </p>
            {user ? (
              <AcceptInvite token={token} />
            ) : (
              <div className="space-y-2">
                <Link href={`/signup?next=/invite/${token}`} className="btn-primary w-full">
                  Sign up to accept
                </Link>
                <Link href={`/login?next=/invite/${token}`} className="btn-ghost w-full">
                  I already have an account
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
