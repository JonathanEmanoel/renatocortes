import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function ProductIndexPage() {
  const product = await prisma.product.findFirst({
    where: { active: true, deletedAt: null },
    orderBy: { createdAt: "desc" }
  });

  redirect(product ? `/cliente/produto/${product.id}` : "/cliente/loja");
}
