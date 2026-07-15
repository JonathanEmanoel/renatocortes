import { redirect } from "next/navigation";
import { products } from "@/utils/client-mocks";

export default function ProductIndexPage() {
  redirect(`/cliente/produto/${products[0].id}`);
}
