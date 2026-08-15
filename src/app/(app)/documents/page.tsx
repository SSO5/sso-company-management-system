import { redirect } from "next/navigation";

// Aug 2026: the old global Documents root (Company Documents grid + Project
// Folders list) was replaced by /projects/folders — see that page and
// getProjectFolders() in server/documents/documents.ts for why. Kept as a
// redirect, not deleted, so any old bookmark/link to /documents still lands
// somewhere useful instead of 404ing.
export default function DocumentsRootRedirect() {
  redirect("/projects/folders");
}
