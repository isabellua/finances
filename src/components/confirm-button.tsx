"use client";

import type { ReactNode } from "react";

/** Botão de submit que pede confirmação antes de enviar o formulário. */
export function ConfirmButton({
  message,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  message: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
