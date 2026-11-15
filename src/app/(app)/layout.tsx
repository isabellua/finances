import { cookies } from "next/headers";
import { Nav } from "@/components/nav";
import { WorkspaceBar } from "@/components/workspace-bar";
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
      <Nav email={user.email} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-6 pb-28 md:pb-10">
        <WorkspaceBar workspaces={workspaces} activeId={workspace?.id} hideValues={hideValues} />
        {children}
      </main>
    </>
  );
}
