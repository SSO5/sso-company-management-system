import Link from "next/link";
export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <Link
        href="/finance"
        className="inline-flex min-h-11 items-center text-sm text-primary"
      >
        ← Pusat Finance
      </Link>
      {children}
    </div>
  );
}
