import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission, can } from "@/lib/permissions";
import { duplicateDocumentKey } from "@/lib/workspace";
import { formatDate } from "@/lib/utils";
import { AiSmartUploadCard } from "@/components/dashboard/ai-smart-upload-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default async function DataPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; view?: string };
}) {
  const actor = await requireUser();
  requirePermission(actor.role, "documents", "view");
  const q = (searchParams.q ?? "").trim().slice(0, 100),
    page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(searchParams.page)) || 1),
    );
  const view = ["files", "unfiled", "records"].includes(searchParams.view ?? "")
    ? searchParams.view!
    : "files";
  const where = {
    deletedAt: null,
    ...(view === "unfiled" ? { folderId: null } : {}),
    ...(q
      ? { originalName: { contains: q, mode: "insensitive" as const } }
      : {}),
  };
  const [documents, count, unfiled, opportunities, projects] =
    await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: [{ uploadedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * 30,
        take: 30,
        select: {
          id: true,
          originalName: true,
          fileSize: true,
          folderId: true,
          uploadedAt: true,
          description: true,
          version: true,
          relatedEntityType: true,
          relatedEntityId: true,
          uploadedBy: { select: { name: true } },
          folder: {
            select: {
              name: true,
              path: true,
              projectId: true,
              opportunityId: true,
            },
          },
          progressReport: { select: { aiGenerated: true } },
        },
      }),
      prisma.document.count({ where }),
      prisma.document.count({ where: { deletedAt: null, folderId: null } }),
      prisma.opportunity.count({ where: { deletedAt: null } }),
      prisma.project.count({ where: { deletedAt: null } }),
    ]);
  // Check just the visible page against the database, not an unbounded in-memory scan.
  const similar = documents.length
    ? await prisma.document.findMany({
        where: {
          deletedAt: null,
          OR: documents.map((d) => ({
            folderId: d.folderId,
            originalName: d.originalName,
            fileSize: d.fileSize,
          })),
        },
        select: { originalName: true, fileSize: true, folderId: true },
      })
    : [];
  const counts = new Map<string, number>();
  for (const d of similar) {
    const key = duplicateDocumentKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const href = (p: number) =>
    `/data?view=${view}&q=${encodeURIComponent(q)}&page=${p}`;
  return (
    <div className="space-y-5">
      <div className="workspace-heading">
        <div>
          <p className="workspace-eyebrow">Sumber yang dapat ditelusuri</p>
          <h1>Data & Dokumen</h1>
          <p className="workspace-muted mt-2">
            Bedakan file bukti, hasil ekstraksi, dan transaksi yang dicatat di
            aplikasi.
          </p>
        </div>
        {can(actor.role, "documents", "create") && <AiSmartUploadCard />}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/data?view=files" className="workspace-stat">
          <small>Dokumen pada filter ini</small>
          <strong>{count}</strong>
        </Link>
        <Link href="/data?view=unfiled" className="workspace-stat">
          <small>Belum memiliki folder</small>
          <strong>{unfiled}</strong>
        </Link>
        <Link href="/data?view=records" className="workspace-stat">
          <small>Catatan prospek / proyek</small>
          <strong>
            {opportunities} / {projects}
          </strong>
        </Link>
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Jenis data">
        {[
          ["files", "File & bukti"],
          ["unfiled", "Perlu penempatan"],
          ["records", "Catatan aplikasi"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/data?view=${key}`}
            className={`rounded-xl px-4 py-3 text-sm ${key === view ? "bg-primary text-white" : "bg-slate-100"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {view === "records" ? (
        <Card>
          <CardHeader>
            <CardTitle>Catatan aplikasi dan dokumen sumber</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="workspace-muted">
              Angka bisnis berasal dari catatan transaksi dan status
              persetujuannya. Mengunggah file bukti tidak otomatis menerbitkan
              invoice atau menyetujui penawaran. Riwayat lama belum selalu
              mencatat metode input; asal manual atau impor tidak ditebak.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["/sales/opportunities", "Prospek & penawaran"],
                ["/projects", "Proyek & laporan lapangan"],
                ["/finance/invoices", "Invoice & status penagihan"],
                ["/projects/folders", "Folder dokumen proyek"],
              ].map(([url, label]) => (
                <Link
                  className="workspace-action text-sm font-medium"
                  key={url}
                  href={url}
                >
                  {label} →
                </Link>
              ))}
            </div>
            {["ADMIN", "IT"].includes(actor.role) && (
              <Link
                href="/settings/document-correction"
                className="inline-block text-sm text-primary"
              >
                Buka alat koreksi data →
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <form className="flex gap-2" action="/data">
            <input type="hidden" name="view" value={view} />
            <input
              name="q"
              defaultValue={q}
              aria-label="Cari nama dokumen"
              placeholder="Cari nama dokumen…"
              className="min-w-0 flex-1 rounded-xl border bg-white px-4 py-3 text-sm"
            />
            <button className="rounded-xl bg-primary px-5 text-sm text-white">
              Cari
            </button>
          </form>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Kandidat duplikat = nama, ukuran, dan folder sama; isi file belum
            dibandingkan. Semua versi tetap disimpan. Gunakan koreksi dokumen
            untuk pemeriksaan sebelum menggabungkan data.
          </p>
          <div className="space-y-3">
            {documents.length === 0 && (
              <p className="rounded-xl border p-6 text-sm text-muted-foreground">
                Tidak ada dokumen pada filter ini.
              </p>
            )}
            {documents.map((d) => (
              <article key={d.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold">
                      {d.originalName}
                    </p>
                    <p className="mt-2 break-words text-xs text-muted-foreground">
                      {d.folder?.path ?? "Belum ditempatkan dalam folder"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="workspace-pill">
                      File tersimpan · v{d.version}
                    </span>
                    {d.progressReport?.aiGenerated && (
                      <span className="workspace-pill">Checklist hasil AI</span>
                    )}
                    {(counts.get(duplicateDocumentKey(d)) ?? 0) > 1 && (
                      <span className="workspace-pill !bg-amber-50 !text-amber-800">
                        Periksa kemiripan
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {formatDate(d.uploadedAt)} · {d.uploadedBy.name} ·{" "}
                    {(d.fileSize / 1024 / 1024).toFixed(2)} MB
                  </span>
                  <div className="flex flex-wrap gap-4">
                    {d.folderId && (
                      <Link
                        className="py-2 font-medium text-primary"
                        href={`/documents/${d.folderId}`}
                      >
                        Buka folder →
                      </Link>
                    )}
                    {d.folder?.projectId && (
                      <Link
                        className="py-2 font-medium text-primary"
                        href={`/projects/${d.folder.projectId}?tab=documents`}
                      >
                        Ruang proyek →
                      </Link>
                    )}
                    {d.folder?.opportunityId && (
                      <Link
                        className="py-2 font-medium text-primary"
                        href={`/sales/opportunities/${d.folder.opportunityId}`}
                      >
                        Ruang prospek →
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <nav
            aria-label="Halaman dokumen"
            className="flex items-center justify-between gap-3 text-sm"
          >
            {page > 1 ? (
              <Link
                href={href(page - 1)}
                className="rounded-xl border px-4 py-3"
              >
                ← Sebelumnya
              </Link>
            ) : (
              <span />
            )}
            <span>
              Halaman {page} · {count} dokumen
            </span>
            {page * 30 < count ? (
              <Link
                href={href(page + 1)}
                className="rounded-xl border px-4 py-3"
              >
                Berikutnya →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      )}
    </div>
  );
}
