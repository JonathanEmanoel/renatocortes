import { Search } from "lucide-react";

type SearchBarProps = {
  placeholder?: string;
};

export function SearchBar({ placeholder = "Pesquisar" }: SearchBarProps) {
  return (
    <div className="flex h-14 items-center gap-3 rounded-[8px] border border-white/14 bg-white/[0.045] px-4">
      <Search className="h-5 w-5 text-white/50" />
      <input
        className="h-full min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/45"
        placeholder={placeholder}
      />
    </div>
  );
}
