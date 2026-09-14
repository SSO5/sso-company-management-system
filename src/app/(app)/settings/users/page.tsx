import { listUsers } from "@/server/settings/users";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateUserDialog } from "@/components/settings/create-user-dialog";
import { UserActiveToggle } from "@/components/settings/user-active-toggle";
import { EditUserDialog } from "@/components/settings/edit-user-dialog";
import { formatDate } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/workspace";

export default async function UsersSettingsPage() {
  const [users, actor] = await Promise.all([listUsers(), requireUserOrThrow()]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><p className="workspace-eyebrow">Akun dan kewenangan</p><h1 className="text-xl font-semibold">Pengguna</h1><p className="text-sm text-muted-foreground">{users.length} akun terdaftar</p></div>
        <CreateUserDialog />
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Peran</TableHead><TableHead>Jabatan</TableHead><TableHead>Status</TableHead><TableHead>Terakhir masuk</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell><Badge variant="outline">{ROLE_LABELS[u.role]}</Badge></TableCell>
              <TableCell className="text-muted-foreground">{u.title || "—"}</TableCell>
              <TableCell><Badge variant={u.isActive ? "success" : "secondary"}>{u.isActive ? "Aktif" : "Tidak aktif"}</Badge></TableCell>
              <TableCell>{formatDate(u.lastLoginAt)}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <EditUserDialog
                    user={{ id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, whatsappNumber: u.whatsappNumber, telegramChatId: u.telegramChatId, isActive: u.isActive, signatureImageUrl: u.signatureImageUrl }}
                    isSelf={u.id === actor.userId}
                  />
                  <UserActiveToggle id={u.id} isActive={u.isActive} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
