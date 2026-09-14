import Link from "next/link";
import { CleanupButton } from "@/components/documents/cleanup-button";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";

export default async function DataReviewPage({ searchParams }: { searchParams: { page?: string } }) {
  const actor = await requireUser();
  requirePermission(actor.role, "documents", "view");
  const page = Math.max(1, Math.min(1000, Math.floor(Number(searchParams.page)) || 1));
  const groups = await prisma.document.groupBy({
    by: ["folderId", "originalName", "fileSize"], where: { deletedAt: null },
    _count: { id: true }, having: { id: { _count: { gt: 1 } } },
    orderBy: [{ _count: { id: "desc" } }, { originalName: "asc" }, { folderId: "asc" }, { fileSize: "asc" }],
    skip: (page - 1) * 10, take: 11,
  });
  const rows = await Promise.all(groups.slice(0, 10).map(async group => ({ group, documents: await prisma.document.findMany({
    where: { deletedAt: null, folderId: group.folderId, originalName: group.originalName, fileSize: group.fileSize },
    orderBy: [{ uploadedAt: "desc" }, { id: "asc" }], take: 20,
    select: { id: true, version: true, uploadedAt: true, relatedEntityType: true, relatedEntityId: true,
      uploadedBy: { select: { name: true } }, folder: { select: { path: true } },
      progressReport: { select: { id: true, number: true, _count: { select: { items: true } } } } },
  }) })));
  return <div className="space-y-5">
    <Link href="/data" className="inline-block py-2 text-sm text-primary">← Data & Dokumen</Link>
    <div className="workspace-heading"><div><p className="workspace-eyebrow">Pemeriksaan data sumber</p><h1>Tinjau kemiripan dokumen</h1><p className="workspace-muted mt-2">Bandingkan file dan keterkaitannya sebelum memutuskan koreksi.</p></div></div>
    <div className="rounded-2xl border bg-amber-50 p-4 text-sm text-amber-950 leading-relaxed">Daftar ini mencocokkan nama persis, ukuran, dan folder. Isi file belum dibandingkan. File mirip dapat memiliki checklist atau transaksi berbeda. Tombol pembersihan membandingkan isi file. Hanya salinan identik yang tidak menjadi bukti laporan atau transaksi yang dapat dipindahkan ke Sampah.</div>
    {rows.length === 0 && <p className="rounded-2xl border p-6">Tidak ada kelompok kemiripan pada halaman ini.</p>}
    {rows.map(({group, documents})=><section key={JSON.stringify([group.folderId,group.originalName,group.fileSize])} className="rounded-2xl border overflow-hidden">
      <div className="p-5 bg-slate-50"><h2 className="font-semibold break-words">{group.originalName}</h2><p className="text-xs text-muted-foreground mt-2 break-words">{documents[0]?.folder?.path || "Tanpa folder"}</p><p className="text-sm mt-2">{group._count.id} file · {(group.fileSize / 1024 / 1024).toFixed(2)} MB per file</p></div>
      <div className="divide-y">{documents.map(d=><article key={d.id} className="p-5 space-y-2"><p className="text-sm font-medium">{d.uploadedBy.name} · {formatDate(d.uploadedAt)} · versi {d.version}</p><p className="text-xs text-muted-foreground break-all">ID dokumen: {d.id}</p><p className="text-sm">{d.progressReport ? `Terhubung ke laporan ${d.progressReport.number} dengan ${d.progressReport._count.items} butir checklist.` : "Tidak memiliki checklist laporan terkait."}</p>{d.relatedEntityType && <p className="text-xs break-words">Keterkaitan tersimpan: {d.relatedEntityType}{d.relatedEntityId ? ` · ${d.relatedEntityId}` : " · tanpa ID catatan"}</p>}<div className="flex flex-wrap gap-3"><a className="inline-block rounded-lg border px-3 py-3 text-sm text-primary" href={`/api/files/${d.id}?view=1`} data-document-title={group.originalName}>Pratinjau file</a>{d.progressReport && <a className="inline-block rounded-lg border px-3 py-3 text-sm text-primary" href={`/api/progress-reports/${d.progressReport.id}/pdf?view=1`} data-document-title={`Checklist ${d.progressReport.number}`}>Pratinjau checklist</a>}</div></article>)}</div>
      {["ADMIN","IT"].includes(actor.role) && <CleanupButton ids={documents.map(d=>d.id)} />}
      {group._count.id > 20 && <p className="p-4 text-sm">20 file pertama ditampilkan. Buka folder untuk versi lainnya.</p>}
      {group.folderId && <Link className="block border-t p-4 text-sm text-primary" href={`/documents/${group.folderId}`}>Buka folder terkait →</Link>}
    </section>)}
    <nav className="flex flex-wrap justify-between gap-3 text-sm" aria-label="Halaman kelompok kemiripan">{page > 1 ? <Link className="rounded-xl border p-3" href={`/data/review?page=${page-1}`}>← Sebelumnya</Link> : <span/>}<span className="p-3">Halaman {page}</span>{groups.length > 10 && <Link className="rounded-xl border p-3" href={`/data/review?page=${page+1}`}>Berikutnya →</Link>}</nav>
    {["ADMIN","IT"].includes(actor.role) && <Link className="inline-block py-3 text-primary text-sm" href="/settings/document-correction">Buka alat koreksi setelah pemeriksaan →</Link>}
  </div>;
}
