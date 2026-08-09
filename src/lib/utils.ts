import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string, currency = "IDR"): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Appends the SOP's ".R1"/".R2" revision suffix (verified against real
 * issued quotations, e.g. "005/QUO/MKT/V/2026.R2") — the base number itself
 * never changes; only the display/printed form does once a document has
 * been revised. Used everywhere a Quotation/CostingSheet number is shown:
 * list pages, detail pages, folder views, and the PDF header.
 */
export function formatRevisedNumber(number: string, revision: number): string {
  return revision > 0 ? `${number}.R${revision}` : number;
}
