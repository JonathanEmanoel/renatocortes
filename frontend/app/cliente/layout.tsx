export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireAuthenticatedClient } from "@/lib/server/auth";
import type { ReactNode } from "react";

type ClientAreaLayoutProps = {
  children: ReactNode;
};

export default async function ClientAreaLayout({ children }: ClientAreaLayoutProps) {
  await requireAuthenticatedClient("/cliente");

  return children;
}
