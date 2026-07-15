import { User } from "lucide-react";
import { cn } from "@/utils/cn";

type AvatarProps = {
  name?: string;
  imageUrl?: string;
  className?: string;
};

export function Avatar({ name, imageUrl, className }: AvatarProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name ?? "Avatar"}
        className={cn("h-12 w-12 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid h-12 w-12 place-items-center rounded-full border border-white/30 bg-white/10 text-white",
        className
      )}
      aria-label={name ?? "Avatar padrão"}
    >
      <User className="h-6 w-6" />
    </div>
  );
}
