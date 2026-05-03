export default function AdminStagePage({ title }: { title: string }) {
  return (
    <div className="space-y-5">
      <h1 className="text-[31px] font-semibold tracking-tight text-[#1f2937]">
        {title}
      </h1>

      <div className="rounded-[10px] border border-[#dde3ec] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="min-h-[560px] rounded-[8px] border border-dashed border-[#d8dee8] bg-[#fbfcfe]" />
      </div>
    </div>
  );
}
