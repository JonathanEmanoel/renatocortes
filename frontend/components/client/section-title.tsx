type SectionTitleProps = {
  title: string;
  action?: React.ReactNode;
};

export function SectionTitle({ title, action }: SectionTitleProps) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span className="h-px w-8 bg-primary" />
        <h2 className="text-lg font-black uppercase tracking-[0.08em] md:text-2xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
