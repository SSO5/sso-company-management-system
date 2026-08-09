"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { toggleUserActive } from "@/server/settings/users";

export function UserActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button size="sm" variant="outline" onClick={async () => {
      const res = await toggleUserActive(id, !isActive);
      if (res.ok) router.refresh();
      else toast({ title: "Unable to update", description: res.error, variant: "destructive" });
    }}>
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
