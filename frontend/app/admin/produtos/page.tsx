export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { ProductManagementPanel } from "@/components/internal/product-management-panel";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function AdminProductsPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/produtos");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  const [categories, products] = await Promise.all([
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } })
  ]);

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Produtos"
          title="Produtos e estoque"
          backHref="/admin"
          backLabel="Painel administrativo"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />
        <div className="mt-8">
          <ProductManagementPanel
            categories={categories.map((category) => ({ id: category.id, name: category.name }))}
            products={products.map((product) => ({
              id: product.id,
              categoryId: product.categoryId,
              name: product.name,
              description: product.description ?? "",
              price: Number(product.price),
              costPrice: Number(product.costPrice),
              stock: product.stock,
              image: product.image ?? "",
              active: product.active,
              visibleInStore: product.visibleInStore
            }))}
          />
        </div>
      </section>
    </main>
  );
}
