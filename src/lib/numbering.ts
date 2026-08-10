import type { Prisma, NumberEntityType } from "@prisma/client";
import { prisma } from "@/lib/db";

const PREFIX_SETTING_KEY: Record<NumberEntityType, string> = {
  CUSTOMER: "customerPrefix",
  LEAD: "leadPrefix",
  OPPORTUNITY: "opportunityPrefix",
  QUOTATION: "quotationPrefix",
  PURCHASE_ORDER: "poPrefix",
  CONTRACT: "contractPrefix",
  PROJECT: "projectPrefix",
  INVOICE: "invoicePrefix",
  PAYMENT: "paymentPrefix",
  EXPENSE: "expensePrefix",
  COSTING: "costingPrefix",
  JOB_ORDER: "jobOrderPrefix",
  GENERAL_DOCUMENT: "generalDocumentPrefix",
  VENDOR_PO: "vendorPoPrefix",
};

const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** 1 (January) -> "I" ... 12 (December) -> "XII". Matches standard Indonesian
 * corporate document numbering (Nomor Surat: 001/ABC/DEF/VII/2026). */
export function toRomanMonth(monthOneBased: number): string {
  return ROMAN_MONTHS[monthOneBased - 1] ?? String(monthOneBased);
}

/**
 * Transaction-safe, sequential, unique document numbering (spec section 5).
 *
 * Implementation notes:
 * - Runs inside the caller's Prisma transaction (`tx`) so the number is
 *   generated atomically together with the record it belongs to — if the
 *   record insert fails, the whole transaction (including the number
 *   increment) rolls back and the number is not "burned".
 * - Uses a single atomic UPDATE ... RETURNING (upsert-then-increment) so two
 *   concurrent requests cannot receive the same sequence value. Postgres
 *   guarantees this is safe under row-level locking for UPDATE statements.
 * - Format: <PADDED SEQUENCE>/<PREFIX>/<ROMAN MONTH>/<YEAR>, e.g.
 *   004/QUO/MKT/VII/2026 — matches SSO's real internal numbering SOP
 *   (verified against the company's numbering registry). Sequence still
 *   resets per calendar year (not per month) per entity type; the prefix
 *   segment can itself contain a "/" (e.g. "QUO/MKT") to encode a
 *   department code, since it's just a stored string.
 * - Prefix, year rollover and padding are configurable via CompanySettings /
 *   NumberSequence rows in Settings > Numbering — never hardcoded per call
 *   site, and never editable directly by normal users (no UI writes the
 *   `currentNumber` field except this function).
 */
export async function generateNumber(
  tx: Prisma.TransactionClient,
  entityType: NumberEntityType,
  atDate: Date = new Date()
): Promise<string> {
  const year = atDate.getFullYear();

  const settings = await tx.companySettings.findUnique({ where: { id: "singleton" } });
  const prefix =
    (settings ? (settings as unknown as Record<string, string>)[PREFIX_SETTING_KEY[entityType]] : undefined) ||
    entityType.slice(0, 3);
  const padding = settings?.numberPadding ?? 3;

  // Ensure the sequence row exists, then atomically increment and read it
  // back in one round trip. The @@unique([entityType, year]) constraint plus
  // this upsert pattern is what makes concurrent calls safe.
  await tx.numberSequence.upsert({
    where: { entityType_year: { entityType, year } },
    create: { entityType, year, prefix, currentNumber: 0, padding },
    update: {},
  });

  const updated = await tx.numberSequence.update({
    where: { entityType_year: { entityType, year } },
    data: { currentNumber: { increment: 1 } },
  });

  const sequencePart = String(updated.currentNumber).padStart(updated.padding, "0");
  const romanMonth = toRomanMonth(atDate.getMonth() + 1);
  return `${sequencePart}/${updated.prefix}/${romanMonth}/${year}`;
}

/**
 * Same sequential/atomic guarantee as generateNumber() above, but for the
 * general document registry (Numbering tab): docTypeCode and deptCode are
 * chosen independently in the UI (e.g. "SK" + "DIR", "QUO" + "MKT") rather
 * than being a fixed per-entity prefix. The counter resets per (docTypeCode,
 * year) — one running sequence per document TYPE company-wide, regardless
 * of which department issues it, matching standard Indonesian "nomor surat
 * keluar" convention. This is intentionally a separate counter pool from
 * generateNumber()/NumberSequence — taking a number here does not consume
 * (or get consumed by) the automatic numbering on Quotation/Invoice/etc.
 * entity creation.
 */
export async function generateRegistryNumber(
  tx: Prisma.TransactionClient,
  docTypeCode: string,
  deptCode: string,
  atDate: Date = new Date()
): Promise<string> {
  const year = atDate.getFullYear();
  const settings = await tx.companySettings.findUnique({ where: { id: "singleton" } });
  const padding = settings?.numberPadding ?? 3;

  await tx.registryNumberSequence.upsert({
    where: { docTypeCode_year: { docTypeCode, year } },
    create: { docTypeCode, year, currentNumber: 0 },
    update: {},
  });

  const updated = await tx.registryNumberSequence.update({
    where: { docTypeCode_year: { docTypeCode, year } },
    data: { currentNumber: { increment: 1 } },
  });

  const sequencePart = String(updated.currentNumber).padStart(padding, "0");
  const romanMonth = toRomanMonth(atDate.getMonth() + 1);
  return `${sequencePart}/${docTypeCode}/${deptCode}/${romanMonth}/${year}`;
}
