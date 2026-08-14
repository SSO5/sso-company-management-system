import { requireUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { StorageHealthCard } from "@/components/settings/storage-health-card";

export default async function StorageSettingsPage() {
  const actor = await requireUser();
  if (actor.role !== "ADMIN" && actor.role !== "IT") redirect("/dashboard");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Penyimpanan File</h1>
        <p className="text-sm text-muted-foreground">
          Memastikan file yang diunggah benar-benar tersimpan permanen — bukan hanya terlihat berhasil.
        </p>
      </div>
      <StorageHealthCard />
    </div>
  );
}
