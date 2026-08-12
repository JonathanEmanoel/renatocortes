import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/utils/cn";

type LogoProps = {
  compact?: boolean;
  className?: string;
};

export function Logo({ compact = false, className }: LogoProps) {
  const logoSize = compact ? 64 : 112;
  const logoFrameStyle: CSSProperties = {
    position: "relative",
    width: logoSize,
    height: logoSize,
    minWidth: logoSize,
    minHeight: logoSize,
    maxWidth: logoSize,
    maxHeight: logoSize,
    overflow: "hidden",
    borderRadius: 9999
  };

  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div
        style={logoFrameStyle}
        className={cn(
          "relative overflow-hidden rounded-full border border-primary/70 bg-black shadow-panel ring-2 ring-white/70",
          compact ? "h-16 w-16" : "h-28 w-28"
        )}
      >
        <span className="absolute inset-1 z-10 rounded-full border-l-4 border-r-4 border-l-accentRed border-r-accentBlue" />
        <Image
          src="/brand/logo.jpeg"
          alt="Renato Cortes Barbearia"
          fill
          sizes={compact ? "64px" : "112px"}
          className="object-cover"
          priority
        />
      </div>
      {!compact ? (
        <div className="-mt-2 rounded-[6px] border border-primary/50 bg-black px-4 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.4)]">
          <p className="text-lg font-black uppercase leading-none tracking-[0.08em] text-white">Renato Cortes</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Barbearia</p>
        </div>
      ) : null}
    </div>
  );
}
