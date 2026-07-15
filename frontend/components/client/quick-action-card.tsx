import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type QuickActionCardProps = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function QuickActionCard({ href, label, icon: Icon }: QuickActionCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-[8px] border border-white/14 bg-card p-5 transition hover:-translate-y-1 hover:border-primary/55"
    >
      <Icon className="h-8 w-8 text-primary" />
      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="font-black uppercase leading-snug">{label}</p>
        <ArrowRight className="h-5 w-5 text-white/50 transition group-hover:text-primary" />
      </div>
    </Link>
  );
}
