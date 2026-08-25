"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { updateMyMoodAction } from "@/server/settings/mood";
import { UI_MOODS } from "@/lib/ui-moods";

/**
 * Personal "suasana" (mood) picker — every user's own preference, no
 * permission gate. Deliberately placed in the topbar's open middle space
 * (between search and the notification bell) with a soft pulsing ring so
 * it gets noticed, since this is a discoverability-first feature: nobody
 * benefits from a reskin option they never find.
 */
export function MoodSwitcher({ currentMood }: { currentMood: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(id: string) {
    setOpen(false);
    startTransition(async () => {
      const result = await updateMyMoodAction(id);
      if (result.ok) {
        const label = UI_MOODS.find((m) => m.id === id)?.label ?? id;
        toast({ title: `Suasana diganti ke "${label}"`, variant: "success" });
        router.refresh();
      } else {
        toast({ title: "Gagal mengganti suasana", description: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={cn(
          "group relative flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1.5",
          "text-xs font-medium text-primary transition-colors hover:bg-primary/[0.12]",
          "disabled:cursor-wait disabled:opacity-70"
        )}
      >
        <span className="absolute -left-0.5 -top-0.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary/70" />
        </span>
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Mau ganti suasana?</span>
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-border bg-card p-2 shadow-lg">
          <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pilih suasana tampilan Anda
          </p>
          <div className="space-y-0.5">
            {UI_MOODS.map((mood) => {
              const active = mood.id === currentMood;
              return (
                <button
                  key={mood.id}
                  type="button"
                  onClick={() => pick(mood.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent",
                    active && "bg-accent"
                  )}
                >
                  <span
                    className="h-6 w-6 shrink-0 rounded-full border border-black/10 shadow-sm"
                    style={{ background: mood.swatch }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{mood.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{mood.tagline}</span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
