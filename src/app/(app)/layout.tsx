import { cookies } from "next/headers";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, workspace, workspaces } = await requireUser();
  const hideValues = (await cookies()).get("hide")?.value === "1";
  return (
    <>
      <Nav email={user.email} workspaces={workspaces} activeId={workspace?.id} hideValues={hideValues} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:pb-10">
        {workspace?.role === "viewer" && (
          <p role="status" className="mb-4 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-muted">
            Somente leitura: você pode ver os dados deste espaço, mas não alterá-los.
          </p>
        )}
        {children}
      </main>
    </>
  );
}
