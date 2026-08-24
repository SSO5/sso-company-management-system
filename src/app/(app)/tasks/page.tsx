import { requireUser } from "@/lib/auth/current-user";
import { listMyDirectivesAction, listGivenDirectivesAction, listAssignableUsersAction } from "@/server/directives";
import { MyDirectivesPanel } from "@/components/tasks/my-directives-panel";
import { DirectiveGiverPanel } from "@/components/tasks/directive-giver-panel";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { open?: string; tab?: string; batch?: string };
}) {
  const actor = await requireUser();
  const isAdmin = actor.role === "ADMIN";

  const [myDirectives, assignableUsers, given] = await Promise.all([
    listMyDirectivesAction(),
    isAdmin ? listAssignableUsersAction() : Promise.resolve([]),
    isAdmin ? listGivenDirectivesAction() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Tugas dari Direktur</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Beri tugas atau reminder langsung ke karyawan lewat sistem — pengganti chat WA pribadi — dan pantau siapa yang sudah menyelesaikan atau membalas."
            : "Tugas dan reminder yang diberikan Direktur untuk Anda lewat sistem."}
        </p>
      </div>

      <MyDirectivesPanel directives={myDirectives} openId={searchParams.open} />

      {isAdmin && (
        <DirectiveGiverPanel
          assignableUsers={assignableUsers}
          given={given}
          initialTab={searchParams.tab === "given" ? "given" : "new"}
          highlightBatchId={searchParams.batch}
        />
      )}
    </div>
  );
}
