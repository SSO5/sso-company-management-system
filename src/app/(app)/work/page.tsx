import Link from "next/link";
import { getMyActionItems } from "@/server/action-items";
import { ActionItemsPanel } from "@/components/dashboard/action-items-panel";
export default async function WorkPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const all = await getMyActionItems();
  const filters = [
    ["all", "Semua"],
    ["overdue", "Terlambat"],
    ["pending_approval", "Persetujuan"],
    ["due_soon", "Segera"],
    ["attention", "Periksa"],
  ];
  const filter = filters.some((f) => f[0] === searchParams.filter)
    ? searchParams.filter
    : "all";
  return (
    <div className="space-y-5">
      <div className="workspace-heading">
        <div>
          <p className="workspace-eyebrow">Antrean pekerjaan</p>
          <h1>Tindak lanjut</h1>
          <p className="workspace-muted mt-2">
            Diurutkan menurut urgensi dan jatuh tempo. Klik tindakan untuk
            membuka ruang terkait.
          </p>
        </div>
        <Link href="/tasks" className="text-sm text-primary">
          Buka penugasan tim →
        </Link>
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Filter tindakan">
        {filters.map(([key, label]) => (
          <Link
            key={key}
            href={`/work?filter=${key}`}
            aria-current={filter === key ? "page" : undefined}
            className={`rounded-xl px-4 py-3 text-sm ${filter === key ? "bg-primary text-white" : "bg-slate-100"}`}
          >
            {label} (
            {key === "all"
              ? all.length
              : all.filter((i) => i.severity === key).length}
            )
          </Link>
        ))}
      </nav>
      <ActionItemsPanel
        title="Daftar tindakan"
        items={
          filter === "all" ? all : all.filter((i) => i.severity === filter)
        }
        limit={500}
      />
    </div>
  );
}
