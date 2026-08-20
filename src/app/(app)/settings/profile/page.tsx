import { getOwnProfile } from "@/server/settings/profile";
import { ProfileForm } from "@/components/settings/profile-form";

export default async function ProfilePage() {
  const profile = await getOwnProfile();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Profil Saya</h1>
        <p className="text-sm text-muted-foreground">Foto, jabatan, dan kontak Anda sendiri — tidak perlu Admin.</p>
      </div>
      <ProfileForm profile={profile} />
    </div>
  );
}
