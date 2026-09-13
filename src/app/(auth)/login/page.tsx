"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "./actions";
import type { LoginFormState } from "./types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowRight, Eye, EyeOff, ShieldCheck, Layers3 } from "lucide-react";
import "@/components/layout/workspace.css";
function LoginFields({ error, next }: { error?: string; next: string }) {
  const { pending } = useFormStatus();
  const [show, setShow] = useState(false);
  return (
    <div className={`login-frame ${pending ? "login-pending" : ""}`}>
      <section className="login-story">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-white px-3 py-2 text-xl font-bold tracking-tight text-blue-800">
            SS<span className="text-amber-500">O</span>
          </span>
          <span className="text-sm font-medium">Sarana Sinergi Optima</span>
        </div>
        <div className="relative z-10">
          <p className="mb-5 text-xs uppercase tracking-[.2em] text-blue-200">
            Command Flow
          </p>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            Satu ruang.
            <br />
            Pekerjaan lebih terarah.
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-7 text-blue-100">
            Dari peluang hingga penyelesaian proyek. Temukan prioritas, dokumen,
            dan keputusan dalam satu alur kerja.
          </p>
          <div className="mt-8 flex flex-wrap gap-2 text-xs text-blue-100">
            {["01 · Peluang", "02 · Proyek", "03 · Penagihan"].map((s) => (
              <span
                key={s}
                className="rounded-full border border-white/20 px-3 py-2"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-2 text-xs text-blue-200">
          <Layers3 size={16} /> Ruang kerja internal perusahaan
        </div>
      </section>
      <section className="login-form-panel">
        <p className="workspace-eyebrow">Selamat datang kembali</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Masuk ke ruang kerja
        </h1>
        <p className="workspace-muted mb-8 mt-3">
          Gunakan akun perusahaan Anda untuk melanjutkan.
        </p>
        <input type="hidden" name="next" value={next} />
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email perusahaan</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="nama@perusahaan.com"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Kata sandi</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                required
                autoComplete="current-password"
                className="pr-12"
                disabled={pending}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={
                  show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                }
                aria-pressed={show}
                className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center text-slate-500"
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Memverifikasi akun…" : "Masuk & lanjutkan"}
            <ArrowRight size={17} />
          </Button>
          <p aria-live="polite" className="sr-only">
            {pending ? "Sedang memverifikasi akun" : ""}
          </p>
        </div>
        <div className="mt-8 flex items-start gap-2 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck size={17} className="shrink-0" />
          Akses mengikuti peran Anda. Jika belum memiliki akun atau lupa sandi,
          hubungi administrator perusahaan.
        </div>
      </section>
    </div>
  );
}
export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const [state, action] = useFormState(loginAction, {} as LoginFormState);
  return (
    <form action={action} className="login-shell">
      <LoginFields
        error={state.error}
        next={searchParams.next ?? "/dashboard"}
      />
    </form>
  );
}
