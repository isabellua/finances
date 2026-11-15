import { PrevisaoTabs } from "./tabs";

export default function PrevisaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <PrevisaoTabs />
      {children}
    </div>
  );
}
