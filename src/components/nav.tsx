"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowsLeftRight,
  ArrowCircleDown,
  ArrowCircleUp,
  Bank,
  CalendarCheck,
  CaretDown,
  ChartLineUp,
  CurrencyCircleDollar,
  DotsThreeVertical,
  Eye,
  EyeSlash,
  GearSix,
  Heartbeat,
  House,
  ListBullets,
  Plus,
  Receipt,
  SignOut,
  Tag,
  UploadSimple,
  type Icon,
} from "@phosphor-icons/react";
import { signOut } from "@/app/login/actions";
import { toggleHideValues } from "@/app/prefs-actions";
import { Dropdown, menuItemCls } from "@/components/dropdown";
import { KIND_LABELS, ROLE_LABELS, type Workspace } from "@/lib/workspace";

/** As quatro áreas do app. Tudo o mais fica atrás do botão "+" ou do menu "Mais". */
const tabs: { href: string; label: string; Icon: Icon }[] = [
  { href: "/", label: "Início", Icon: House },
  { href: "/lancamentos", label: "Lançamentos", Icon: ListBullets },
  { href: "/previsao", label: "Previsão", Icon: ChartLineUp },
  { href: "/contas", label: "Contas", Icon: Bank },
];

function active(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const adders: { href: string; label: string; Icon: Icon }[] = [
  { href: "/novo?tipo=expense", label: "Despesa", Icon: ArrowCircleDown },
  { href: "/novo?tipo=income", label: "Entrada", Icon: ArrowCircleUp },
  { href: "/novo?tipo=transfer", label: "Transferência", Icon: ArrowsLeftRight },
  { href: "/novo?tipo=invoice_payment", label: "Pagar fatura", Icon: Receipt },
  { href: "/previsao/pagar?novo=1", label: "Conta a pagar ou assinatura", Icon: CalendarCheck },
  { href: "/cambio", label: "Compra internacional", Icon: CurrencyCircleDollar },
];

export function Nav({
  email,
  workspaces,
  activeId,
  hideValues,
}: {
  email: string | undefined;
  workspaces: Workspace[];
  activeId: string | undefined;
  hideValues: boolean;
}) {
  const pathname = usePathname();
  const current = workspaces.find((w) => w.id === activeId);
  const isOwner = current?.role === "owner";

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-raised print:hidden">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3 md:h-16 md:gap-3 md:px-4">
          <Link href="/" className="hidden text-[19px] font-[650] tracking-[-0.4px] text-ink sm:block">
            Finanças
          </Link>

          {current && (
            <Dropdown
              ariaLabel={`Espaço atual: ${current.name}. Trocar de espaço`}
              buttonClassName="flex min-h-10 max-w-[11rem] items-center gap-2 rounded-lg border border-line-strong px-3 text-sm font-medium text-ink hover:bg-sunken"
              label={
                <>
                  <span className="truncate">{current.name}</span>
                  <CaretDown size={14} aria-hidden />
                </>
              }
            >
              {workspaces.map((w) => (
                <form key={w.id} method="post" action="/espaco/trocar">
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="next" value={pathname} />
                  <button role="menuitem" aria-current={w.id === activeId ? "true" : undefined} className={`${menuItemCls} flex-col !items-start gap-0 aria-[current=true]:bg-accent-tint`}>
                    <span className="font-medium">{w.name}</span>
                    <span className="text-xs text-ink-muted">{KIND_LABELS[w.kind]} · {ROLE_LABELS[w.role]}</span>
                  </button>
                </form>
              ))}
              <Link role="menuitem" href="/espacos/novo" className={`${menuItemCls} border-t border-line text-accent-text`}>
                <Plus size={18} aria-hidden /> Novo espaço
              </Link>
            </Dropdown>
          )}

          <nav className="ml-2 hidden gap-1 md:flex" aria-label="Principal">
            {tabs.map(({ href, label, Icon: I }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(pathname, href) ? "page" : undefined}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-sunken aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent-text"
              >
                <I size={18} aria-hidden />
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="hidden md:block">
              <Dropdown
                align="right"
                buttonClassName="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:brightness-95"
                label={<><Plus size={18} weight="bold" aria-hidden /> Novo</>}
              >
                {adders.map(({ href, label, Icon: I }) => (
                  <Link key={href} role="menuitem" href={href} className={menuItemCls}>
                    <I size={20} aria-hidden /> {label}
                  </Link>
                ))}
              </Dropdown>
            </div>

            <form action={toggleHideValues}>
              <button
                aria-pressed={hideValues}
                aria-label={hideValues ? "Mostrar valores" : "Ocultar valores"}
                title={hideValues ? "Mostrar valores" : "Ocultar valores"}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-sunken"
              >
                {hideValues ? <EyeSlash size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
              </button>
            </form>

            <Dropdown
              align="right"
              ariaLabel="Mais opções"
              buttonClassName="flex h-10 items-center gap-1 rounded-lg px-2 text-ink-muted hover:bg-sunken"
              label={<><DotsThreeVertical size={22} weight="bold" aria-hidden /><span className="hidden text-sm sm:inline">Mais</span></>}
            >
              <Link role="menuitem" href="/importar" className={menuItemCls}><UploadSimple size={20} aria-hidden /> Importar extrato ou fatura</Link>
              <Link role="menuitem" href="/categorias" className={menuItemCls}><Tag size={20} aria-hidden /> Categorias</Link>
              <Link role="menuitem" href="/saude" className={menuItemCls}><Heartbeat size={20} aria-hidden /> Saúde financeira</Link>
              {isOwner && (
                <Link role="menuitem" href="/configuracoes" className={menuItemCls}><GearSix size={20} aria-hidden /> Configurações do espaço</Link>
              )}
              <Link role="menuitem" href="/mais" className={menuItemCls}><ListBullets size={20} aria-hidden /> Espaços e conta</Link>
              <form action={signOut} className="border-t border-line pt-0.5">
                <button role="menuitem" className={menuItemCls}>
                  <SignOut size={20} aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span>Sair</span>
                    {email && <span className="truncate text-xs text-ink-subtle">{email}</span>}
                  </span>
                </button>
              </form>
            </Dropdown>
          </div>
        </div>
      </header>

      {/* Celular: 4 abas e o botão "+" no centro, sempre à mão. */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {[tabs[0], tabs[1], null, tabs[2], tabs[3]].map((t, i) =>
            t ? (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active(pathname, t.href) ? "page" : undefined}
                className="group flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] leading-[14px] font-medium text-ink-subtle aria-[current=page]:text-accent-text"
              >
                <t.Icon size={24} aria-hidden weight={active(pathname, t.href) ? "fill" : "regular"} />
                {t.label}
              </Link>
            ) : (
              <div key={`fab-${i}`} className="relative">
                <Link
                  href="/novo"
                  aria-label="Adicionar lançamento"
                  className="absolute -top-6 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg active:scale-95"
                >
                  <Plus size={30} weight="bold" aria-hidden />
                </Link>
              </div>
            ),
          )}
        </div>
      </nav>
    </>
  );
}
