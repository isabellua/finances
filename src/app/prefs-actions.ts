"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

/** Liga/desliga o modo "ocultar valores" (guardado em cookie; vale em todas as telas). */
export async function toggleHideValues() {
  const jar = await cookies();
  const next = jar.get("hide")?.value === "1" ? "0" : "1";
  jar.set("hide", next, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
