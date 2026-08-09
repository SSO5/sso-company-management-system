import Link from "next/link";
import { getDocumentRoots } from "@/server/documents/documents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Folder as FolderIcon } from "lucide-react";

export default async function DocumentsRootPage() {
  const { companyFolders, projectFolders } = await getDocumentRoots();

  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-semibold">Documents</h1><p className="text-sm text-muted-foreground">Company folders and per-project folders (auto-generated when a deal is Won). Pre-Won sales documents live inside each Opportunity card under Sales &gt; Opportunities.</p></div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Company Documents</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {companyFolders.map((f) => (
            <Link key={f.id} href={`/documents/${f.id}`}>
              <Card className="transition-colors hover:bg-accent">
                <CardContent className="flex items-center gap-2 p-4">
                  <FolderIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{f.name}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Project Folders ({projectFolders.length})</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {projectFolders.map((f) => (
            <Link key={f.id} href={`/documents/${f.id}`}>
              <Card className="transition-colors hover:bg-accent">
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><FolderIcon className="h-4 w-4 text-muted-foreground" />{f.name}</CardTitle></CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
