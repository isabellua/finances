import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();
  return (
    <>
      <Nav email={user.email} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-6 pb-28 md:pb-10">
        {children}
      </main>
    </>
  );
}
