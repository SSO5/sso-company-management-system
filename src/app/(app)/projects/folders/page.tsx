import Link from "next/link";
import { getProjectFolders } from "@/server/documents/documents";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Folder as FolderIcon } from "lucide-react";

/**
 * "Dokumen Proyek" — moved here from the old standalone /documents page
 * (Aug 2026). That page used to also show a "Company Documents" grid
 * (Administrasi, HR, Legal, etc.) which was removed outright; the only
 * thing worth keeping was this per-project folder list, and browsing a
 * job's documents is squarely "Pekerjaan" work, not a separate module.
 * Folder detail browsing itself still lives at /documents/[folderId] — only
 * this root listing moved.
 */
export default async function ProjectFoldersPage() {
  const { projectFolders } = await getProjectFolders();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dokumen Proyek</h1>
        <p className="text-sm text-muted-foreground">
          Folder dokumen per-project (dibuat otomatis saat deal Won). Dokumen sales pra-Won ada di dalam masing-masing
          card Opportunity di Pekerjaan &gt; Prospek &amp; Penawaran.
        </p>
      </div>

      {projectFolders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada folder project.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {projectFolders.map((f) => (
            <Link key={f.id} href={`/documents/${f.id}`}>
              <Card className="transition-colors hover:bg-accent">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FolderIcon className="h-4 w-4 text-muted-foreground" />
                    {f.name}
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
