"use client";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "./actions";
import type { LoginFormState } from "./types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const initialState: LoginFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Masuk…" : "Masuk"}
    </Button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            PT Sarana Sinergi Optima
          </p>
          <h1 className="mt-1 text-lg font-semibold">Company Management System</h1>
        </div>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="username" placeholder="you@company.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{state.error}</p>
          )}
          <SubmitButton />
        </form>
        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Akun demo dibuat lewat <code>npm run db:seed</code> — lihat README.
        </p>
      </div>
    </div>
  );
}
