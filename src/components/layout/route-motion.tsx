"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
export function RouteMotion({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.closest("main")?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div key={pathname} ref={ref} className="workspace-route">
      {children}
    </div>
  );
}
