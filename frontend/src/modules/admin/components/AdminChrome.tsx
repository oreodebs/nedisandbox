import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function AdminPageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-tight text-[#1f2937]">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-1 text-sm text-[#8b95a7]">{subtitle}</p>
      ) : null}
    </div>
  );
}

export function AdminStatCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "bg-[#eef8ef] text-[#54b85b]",
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <div className="rounded-[10px] border border-[#dde3ec] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-[#4b5563]">{label}</div>
          <div className="mt-3 text-[31px] font-semibold leading-none text-[#111827]">
            {value}
          </div>
          <div className="mt-2 text-xs text-[#a0a8b7]">{note}</div>
        </div>

        <div
          className={[
            "mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm",
            tone,
          ].join(" ")}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function AdminPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-[#dde3ec] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-[#1f2937]">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-xs text-[#9aa3b2]">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function AdminTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-[12px]">
        <thead>
          <tr className="text-[#7f8898]">
            {headers.map((header) => (
              <th key={header} className="pb-3 pr-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef2f7] text-[#3f4b5f]">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-3 pr-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminActionButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="rounded-[6px] bg-[#e6f9e6] px-3 py-1.5 text-[12px] font-medium text-[#45b14f] transition hover:bg-[#d8f5d9]"
    >
      {label}
    </button>
  );
}

export function AdminBarChart({
  items,
}: {
  items: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[70px_1fr_34px] items-center gap-3"
        >
          <div className="text-[11px] text-[#6b7280]">{item.label}</div>
          <div className="h-[10px] rounded-full bg-[#eef3f7]">
            <div
              className="h-[10px] rounded-full bg-[#64cb6a]"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <div className="text-right text-[11px] text-[#7c8595]">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
