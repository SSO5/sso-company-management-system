import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { approveQuotation, rejectQuotation } from "@/lib/workflows/quotation";
import { approveInvoice, rejectInvoice, createInvoice } from "@/lib/workflows/finance";
import { approveVendorPO, rejectVendorPO, createVendorPurchaseOrder } from "@/lib/workflows/vendor-po";
import { approveExpense, rejectExpense } from "@/lib/workflows/expense";
import { createCostingSheet, convertCostingToQuotation } from "@/lib/workflows/costing";
import { searchCustomerCandidates } from "@/lib/workflows/telegram-costing-draft";
import { calcCostingSummary, computeBillingSchedule, calcInvoiceTotals, calcVendorPoTotals } from "@/lib/workflows/calculations";
import { simulateQuotationRevision, commitQuotationRevision } from "@/lib/workflows/telegram-automation";
import { createProgressReport, addProgressReportItem } from "@/lib/workflows/progress-report";
import { moveDocumentToTrash, uploadDocument } from "@/lib/workflows/documents";
import { renameDocumentFile, relocateDocument } from "@/lib/workflows/corrections";
import { generateProgressReportFromDocument } from "@/server/projects/progress-reports";
import { isExtractableMimeType } from "@/lib/ai/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { RevisionAction } from "@/lib/ai/parse-revision-command";
import type { CostingSheetInput, CostingLineItemInput } from "@/lib/validation/costing";
import type { InvoiceInput } from "@/lib/validation/finance";
import type { VendorPurchaseOrderInput } from "@/lib/validation/sales";
import type { SessionPayload } from "@/lib/auth/session";

function parseOptionalDate(value: unknown): Date | null | "invalid" {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? "invalid" : d;
}

function clampLimit(input: unknown, def = 15, max = 30): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

/** Strips the Telegram-specific *bold* markdown and "Balas ya/batal" instruction line from a shared preview string — this chat has its own Confirm/Cancel buttons instead of a text reply. */
function cleanPreview(text: string): string {
  return text.replace(/\*/g, "").split("\n\nBalas")[0].trim();
}

/**
 * The closed set of tools the in-app AI assistant may call — same "narrow,
 * explicit vocabulary" philosophy as the Telegram automation's
 * parse-revision-command.ts: every tool maps 1:1 onto a real, already-built
 * app function (never a raw DB write, never SQL the model wrote itself).
 *
 * Read tools execute immediately and return real data. Write tools (see
 * WRITE_TOOLS below) never mutate anything on the first call — they only
 * describe what WOULD happen and hand back a pendingActionId; the actual
 * mutation only runs from confirmAssistantAction() after the user clicks
 * Confirm in the chat UI, which re-checks the same permission gate again
 * before touching anything.
 */

export const WRITE_TOOLS = new Set([
  "approve_quotation",
  "reject_quotation",
  "approve_invoice",
  "reject_invoice",
  "approve_vendor_po",
  "reject_vendor_po",
  "approve_expense",
  "reject_expense",
  "create_costing_sheet",
  "convert_costing_to_quotation",
  "revise_quotation",
  "create_invoice",
  "create_vendor_po",
  "create_progress_report",
  "create_progress_report_from_document",
  "rename_document",
  "move_document",
  "trash_document",
]);

/** A file attached to the current chat turn — passed through to tools that can act on it (mirrors AssistantAttachment in src/server/assistant.ts). */
export interface AssistantAttachmentInput {
  dataBase64: string;
  mimeType: string;
  fileName: string;
}

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_quotation_status",
    description: "Cek status, customer, nilai, dan siapa yang submit satu quotation berdasarkan nomornya.",
    input_schema: {
      type: "object",
      properties: { quotationNumber: { type: "string", description: "Nomor quotation, boleh sebagian (mis. '003')." } },
      required: ["quotationNumber"],
    },
  },
  {
    name: "list_pending_approvals",
    description:
      "Daftar SEMUA dokumen yang sedang menunggu approval Direktur di seluruh modul — quotation, invoice, vendor PO, dan project expense sekaligus, bukan cuma quotation.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_project_status",
    description: "Cek progress, deadline, PM, dan status satu project berdasarkan nomornya.",
    input_schema: {
      type: "object",
      properties: { projectNumber: { type: "string", description: "Nomor project, boleh sebagian." } },
      required: ["projectNumber"],
    },
  },
  {
    name: "get_invoice_status",
    description: "Cek status, customer, nilai, dan due date satu invoice berdasarkan nomornya.",
    input_schema: {
      type: "object",
      properties: { invoiceNumber: { type: "string", description: "Nomor invoice, boleh sebagian." } },
      required: ["invoiceNumber"],
    },
  },
  {
    name: "get_vendor_po_status",
    description: "Cek status, vendor, dan nilai satu Vendor Purchase Order berdasarkan nomornya.",
    input_schema: {
      type: "object",
      properties: { poNumber: { type: "string", description: "Nomor Vendor PO, boleh sebagian." } },
      required: ["poNumber"],
    },
  },
  {
    name: "get_expense_status",
    description: "Cek status, kategori, dan nilai satu project expense berdasarkan nomornya.",
    input_schema: {
      type: "object",
      properties: { expenseNumber: { type: "string", description: "Nomor expense, boleh sebagian." } },
      required: ["expenseNumber"],
    },
  },
  {
    name: "get_billing_schedule",
    description:
      "Cari SEMUA project yang masih ada sisa tagihan (belum ditagih/belum full di-invoice) — persis data yang sama dengan halaman 'Billing Schedule' di app. Nilai remainingToBill dihitung dari total nilai PO customer dikurangi total yang sudah di-invoice. Pakai ini untuk pertanyaan seperti 'project apa aja yang belum ditagih' atau 'siapa yang masih ada piutang belum di-invoice'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_projects",
    description:
      "Cari/daftar banyak project sekaligus dengan filter opsional — untuk pertanyaan umum seperti 'project apa aja yang lagi ACTIVE', 'project customer X', bukan cuma satu nomor spesifik.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["PLANNING", "ACTIVE", "ON_HOLD", "AT_RISK", "COMPLETED", "CANCELLED", "CLOSED"], description: "Filter status project (opsional)." },
        customerName: { type: "string", description: "Filter nama customer, boleh sebagian (opsional)." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
    },
  },
  {
    name: "list_invoices",
    description:
      "Cari/daftar banyak invoice sekaligus dengan filter opsional — untuk pertanyaan umum seperti 'invoice yang overdue', 'invoice customer X', 'invoice project Y', bukan cuma satu nomor spesifik.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"], description: "Filter status invoice (opsional)." },
        customerName: { type: "string", description: "Filter nama customer, boleh sebagian (opsional)." },
        projectNumber: { type: "string", description: "Filter nomor project, boleh sebagian (opsional)." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
    },
  },
  {
    name: "list_quotations",
    description:
      "Cari/daftar banyak quotation sekaligus dengan filter opsional — termasuk yang sudah WON/LOST/SENT, bukan cuma yang sedang menunggu approval (pakai list_pending_approvals untuk itu).",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "SENT", "WON", "LOST", "EXPIRED", "CANCELLED"], description: "Filter status quotation (opsional)." },
        customerName: { type: "string", description: "Filter nama customer, boleh sebagian (opsional)." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
    },
  },
  {
    name: "list_vendor_pos",
    description: "Cari/daftar banyak Vendor Purchase Order sekaligus dengan filter opsional.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "SENT", "CONFIRMED", "CANCELLED"], description: "Filter status Vendor PO (opsional)." },
        vendorName: { type: "string", description: "Filter nama vendor, boleh sebagian (opsional)." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
    },
  },
  {
    name: "list_expenses",
    description: "Cari/daftar banyak project expense sekaligus dengan filter opsional.",
    input_schema: {
      type: "object",
      properties: {
        approvalStatus: { type: "string", enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"], description: "Filter status approval (opsional)." },
        category: { type: "string", enum: ["LABOR", "MATERIALS", "TRANSPORTATION", "ACCOMMODATION", "VENDOR", "EQUIPMENT", "MARKETING", "OTHER"], description: "Filter kategori (opsional)." },
        projectNumber: { type: "string", description: "Filter nomor project, boleh sebagian (opsional)." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
    },
  },
  {
    name: "search_customers",
    description: "Cari customer berdasarkan nama (boleh sebagian) — untuk pertanyaan seperti 'kita punya customer apa aja namanya mengandung X'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nama customer, boleh sebagian." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
      required: ["query"],
    },
  },
  {
    name: "approve_quotation",
    description: "Approve satu quotation yang sedang menunggu approval. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: { quotationNumber: { type: "string", description: "Nomor quotation yang mau di-approve." } },
      required: ["quotationNumber"],
    },
  },
  {
    name: "reject_quotation",
    description: "Reject satu quotation yang sedang menunggu approval, dengan alasan. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        quotationNumber: { type: "string", description: "Nomor quotation yang mau di-reject." },
        reason: { type: "string", description: "Alasan penolakan." },
      },
      required: ["quotationNumber", "reason"],
    },
  },
  {
    name: "approve_invoice",
    description: "Approve satu invoice yang sedang menunggu approval. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: { invoiceNumber: { type: "string", description: "Nomor invoice yang mau di-approve." } },
      required: ["invoiceNumber"],
    },
  },
  {
    name: "reject_invoice",
    description: "Reject satu invoice yang sedang menunggu approval, dengan alasan. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        invoiceNumber: { type: "string", description: "Nomor invoice yang mau di-reject." },
        reason: { type: "string", description: "Alasan penolakan." },
      },
      required: ["invoiceNumber", "reason"],
    },
  },
  {
    name: "approve_vendor_po",
    description: "Approve satu Vendor PO yang sedang menunggu approval. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: { poNumber: { type: "string", description: "Nomor Vendor PO yang mau di-approve." } },
      required: ["poNumber"],
    },
  },
  {
    name: "reject_vendor_po",
    description: "Reject satu Vendor PO yang sedang menunggu approval, dengan alasan. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        poNumber: { type: "string", description: "Nomor Vendor PO yang mau di-reject." },
        reason: { type: "string", description: "Alasan penolakan." },
      },
      required: ["poNumber", "reason"],
    },
  },
  {
    name: "approve_expense",
    description: "Approve satu project expense yang sedang menunggu approval. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: { expenseNumber: { type: "string", description: "Nomor expense yang mau di-approve." } },
      required: ["expenseNumber"],
    },
  },
  {
    name: "reject_expense",
    description: "Reject satu project expense yang sedang menunggu approval, dengan alasan. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        expenseNumber: { type: "string", description: "Nomor expense yang mau di-reject." },
        reason: { type: "string", description: "Alasan penolakan." },
      },
      required: ["expenseNumber", "reason"],
    },
  },
  {
    name: "create_costing_sheet",
    description:
      "Buat costing sheet baru (status DRAFT) untuk satu customer/project, dengan satu atau lebih item (nama, qty, unit, harga modal, margin%). TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat. Jangan pernah menebak angka qty/harga/margin yang tidak disebutkan user secara eksplisit — tanya dulu kalau belum lengkap.",
    input_schema: {
      type: "object",
      properties: {
        customerName: { type: "string", description: "Nama customer (boleh sebagian/mirip), akan dicocokkan ke data customer yang ada." },
        projectTitle: { type: "string", description: "Judul/nama project untuk costing ini." },
        jobNo: { type: "string", description: "Nomor job internal (opsional)." },
        operationalCost: { type: "number", description: "Biaya operasional tambahan di luar item (opsional, default 0)." },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nama item/pekerjaan." },
              quantity: { type: "number", description: "Kuantitas." },
              unit: { type: "string", description: "Satuan, mis. pcs/lot/unit." },
              costUnitPrice: { type: "number", description: "Harga modal per unit (Rupiah)." },
              supplierDiscountPercent: { type: "number", description: "Diskon dari supplier dalam persen (opsional, default 0)." },
              marginPercent: { type: "number", description: "Margin keuntungan dalam persen." },
            },
            required: ["name", "quantity", "unit", "costUnitPrice", "marginPercent"],
          },
        },
      },
      required: ["customerName", "projectTitle", "items"],
    },
  },
  {
    name: "convert_costing_to_quotation",
    description:
      "Ubah satu costing sheet (yang sudah ada, status belum CONVERTED) menjadi Quotation baru — persis alur 'Buat Quotation' di app. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        costingNumber: { type: "string", description: "Nomor costing sheet, boleh sebagian." },
        contactName: { type: "string", description: "Nama PIC/kontak di sisi customer untuk quotation ini (opsional, dicocokkan ke data kontak customer)." },
        validUntilDays: { type: "number", description: "Opsional, quotation berlaku berapa hari dari sekarang (default 30)." },
      },
      required: ["costingNumber"],
    },
  },
  {
    name: "revise_quotation",
    description:
      "Revisi satu quotation yang sudah ada, lewat costing yang menjadi dasarnya — persis alur revisi quotation yang sudah dipakai lewat Telegram. Hanya mendukung TIGA jenis perubahan (jangan menebak jenis lain): 'percent_adjustment' (naik/turunkan harga jual X%, pakai percent negatif untuk turun), 'operational_cost_delta' (tambah/kurangi biaya operasional sejumlah Rupiah, pakai amount negatif untuk kurangi), atau 'item_quantity' (ubah qty satu item tertentu berdasarkan namanya). TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        quotationNumber: { type: "string", description: "Nomor quotation yang mau direvisi." },
        adjustmentType: { type: "string", enum: ["percent_adjustment", "operational_cost_delta", "item_quantity"] },
        percent: { type: "number", description: "Wajib diisi kalau adjustmentType = percent_adjustment." },
        amount: { type: "number", description: "Wajib diisi kalau adjustmentType = operational_cost_delta." },
        itemName: { type: "string", description: "Wajib diisi kalau adjustmentType = item_quantity." },
        quantity: { type: "number", description: "Wajib diisi kalau adjustmentType = item_quantity." },
      },
      required: ["quotationNumber", "adjustmentType"],
    },
  },
  {
    name: "create_invoice",
    description:
      "Buat invoice baru (status DRAFT) untuk satu project, lengkap dengan referensi Customer PO, PIC, dan PPN. Jumlah HARUS Rupiah eksplisit yang disebutkan user sendiri (net setelah dikurangi DP kalau relevan) — jangan pernah menghitung dari persentase. Invoice pertama untuk sebuah project otomatis ditautkan ke quotation asalnya (jadi 'invoice DP', deskripsinya mengikuti scope quotation itu); invoice berikutnya tidak. PPN dihitung otomatis oleh sistem dari taxPercent (default 11%) menggunakan rumus yang sama persis dengan Quotation/Invoice manual di app — bukan dihitung sendiri oleh AI. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        projectNumber: { type: "string", description: "Nomor project yang mau ditagih, boleh sebagian." },
        amount: { type: "number", description: "Jumlah tagihan dalam Rupiah (net, sebelum PPN), disebutkan eksplisit oleh user." },
        dpPercent: { type: "number", description: "Opsional, hanya untuk label 'DP X%' di deskripsi invoice — tidak memengaruhi amount." },
        dueInDays: { type: "number", description: "Opsional, jatuh tempo berapa hari dari sekarang (default 30)." },
        taxPercent: { type: "number", description: "Opsional, persentase PPN yang DITAMBAHKAN ke amount (default 11, sesuai standar). Isi 0 kalau invoice ini tidak kena PPN." },
        customerPO: { type: "string", description: "Opsional, nomor PO customer yang jadi rujukan invoice ini." },
        poDate: { type: "string", description: "Opsional, tanggal PO customer tsb, format YYYY-MM-DD." },
        contactName: { type: "string", description: "Opsional, nama PIC di sisi customer untuk invoice ini (dicocokkan ke data kontak customer). Kalau kosong dan invoice ini tertaut quotation, ikut PIC quotation-nya." },
      },
      required: ["projectNumber", "amount"],
    },
  },
  {
    name: "create_vendor_po",
    description:
      "Buat Vendor Purchase Order baru (status DRAFT) untuk belanja/procurement ke supplier/vendor luar — persis alur 'Buat Vendor PO' di app. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        vendorName: { type: "string", description: "Nama vendor/supplier." },
        projectNumber: { type: "string", description: "Nomor project yang jadi tujuan belanja ini (opsional)." },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              description: { type: "string", description: "Deskripsi item/jasa yang dibeli." },
              quantity: { type: "number", description: "Kuantitas." },
              unit: { type: "string", description: "Satuan, mis. pcs/lot/unit." },
              unitPrice: { type: "number", description: "Harga per unit (Rupiah)." },
            },
            required: ["description", "quantity", "unitPrice"],
          },
        },
        taxPercent: { type: "number", description: "Opsional, persentase PPN (default 11)." },
        discount: { type: "number", description: "Opsional, diskon dalam Rupiah (default 0)." },
        paymentTerms: { type: "string", description: "Opsional, syarat pembayaran ke vendor." },
        deliveryTerms: { type: "string", description: "Opsional, syarat pengiriman." },
        notes: { type: "string", description: "Opsional, catatan tambahan." },
      },
      required: ["vendorName", "items"],
    },
  },
  {
    name: "create_progress_report",
    description:
      "Buat laporan progres lapangan (progress report) untuk satu project, dengan daftar checkpoint/item pekerjaan — persis alur 'Buat Progress Report' di app. Foto before/after tetap harus diupload manual di app setelahnya (chat tidak bisa upload file). TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        projectNumber: { type: "string", description: "Nomor project, boleh sebagian." },
        inspectionDate: { type: "string", description: "Opsional, tanggal inspeksi/kunjungan, format YYYY-MM-DD (default hari ini)." },
        location: { type: "string", description: "Opsional, lokasi/site kunjungan." },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              partName: { type: "string", description: "Nama part/checkpoint yang diperiksa/dikerjakan." },
              notes: { type: "string", description: "Opsional, catatan untuk checkpoint ini." },
              isDone: { type: "boolean", description: "Opsional, apakah checkpoint ini sudah selesai (default false)." },
            },
            required: ["partName"],
          },
        },
      },
      required: ["projectNumber", "items"],
    },
  },
  {
    name: "create_progress_report_from_document",
    description:
      "Generate progress report OTOMATIS lewat ekstraksi AI standar SSO dari SATU FILE yang dilampirkan user di chat ini (PDF laporan lapangan atau foto checklist) — beda dengan create_progress_report (checkpoint diketik manual, tanpa file sumber). Pakai tool ini KHUSUS kalau ada file terlampir DAN user memang minta dibuatkan progress report dari file itu. Belum langsung dieksekusi — user akan diminta konfirmasi, TERMASUK pilihan menyimpan file sumber itu ke folder Progress Report project atau menghapusnya (ke Trash) setelah laporannya jadi.",
    input_schema: {
      type: "object",
      properties: {
        projectNumber: { type: "string", description: "Nomor project tujuan, boleh sebagian." },
      },
      required: ["projectNumber"],
    },
  },
  {
    name: "get_progress_report",
    description:
      "Baca progress report (laporan lapangan) yang SUDAH ADA untuk satu project — termasuk daftar checkpoint/checklist-nya (nama part, sudah selesai atau belum, catatan). Pakai ini untuk pertanyaan seperti 'cek checklist progress report project X' atau 'item apa yang belum selesai di laporan Y' — jangan bilang tidak bisa, tool ini yang harus dipakai.",
    input_schema: {
      type: "object",
      properties: {
        projectNumber: { type: "string", description: "Nomor project, boleh sebagian." },
        reportNumber: { type: "string", description: "Opsional, nomor progress report spesifik (boleh sebagian). Kalau kosong, ambil laporan terbaru project ini." },
      },
      required: ["projectNumber"],
    },
  },
  {
    name: "list_documents",
    description:
      "Cari/daftar dokumen yang sudah tersimpan di sistem (di folder project/customer/dsb), dengan filter opsional. Untuk pertanyaan seperti 'dokumen apa aja di project X', 'ada file quotation untuk Y nggak'.",
    input_schema: {
      type: "object",
      properties: {
        projectNumber: { type: "string", description: "Filter nomor project, boleh sebagian (opsional)." },
        nameQuery: { type: "string", description: "Filter nama file, boleh sebagian (opsional)." },
        folderQuery: { type: "string", description: "Filter nama/path folder, boleh sebagian, mis. 'quotation', 'invoice', 'bast' (opsional)." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
    },
  },
  {
    name: "rename_document",
    description:
      "Ganti nama file dokumen yang sudah tersimpan supaya lebih rapi/proper — cuma bisa dipakai Admin/IT (koreksi data), akan tercatat di Activity Log. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        projectNumber: { type: "string", description: "Nomor project tempat dokumen berada, boleh sebagian (opsional, mempersempit pencarian)." },
        nameQuery: { type: "string", description: "Nama file saat ini (atau sebagian), untuk mencari dokumennya." },
        newName: { type: "string", description: "Nama file baru yang proper." },
        reason: { type: "string", description: "Alasan penggantian nama (wajib, akan tercatat di log)." },
      },
      required: ["nameQuery", "newName", "reason"],
    },
  },
  {
    name: "move_document",
    description:
      "Pindahkan file dokumen ke folder lain dalam project yang sama (kalau dirasa salah taruh) — cuma bisa dipakai Admin/IT (koreksi data), akan tercatat di Activity Log. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        projectNumber: { type: "string", description: "Nomor project tempat dokumen & folder tujuan berada, boleh sebagian." },
        nameQuery: { type: "string", description: "Nama file saat ini (atau sebagian), untuk mencari dokumennya." },
        destinationFolderQuery: { type: "string", description: "Nama/path folder tujuan, boleh sebagian, mis. 'quotation', 'invoice'." },
        reason: { type: "string", description: "Alasan pemindahan (wajib, akan tercatat di log)." },
      },
      required: ["projectNumber", "nameQuery", "destinationFolderQuery", "reason"],
    },
  },
  {
    name: "trash_document",
    description:
      "Hapus (pindah ke Trash — masih bisa dipulihkan lewat app, bukan hapus permanen) satu file dokumen yang dirasa tidak sesuai/salah upload. Hanya untuk role dengan izin hapus dokumen (Admin/IT). TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        projectNumber: { type: "string", description: "Nomor project tempat dokumen berada, boleh sebagian (opsional, mempersempit pencarian)." },
        nameQuery: { type: "string", description: "Nama file (atau sebagian), untuk mencari dokumennya." },
      },
      required: ["nameQuery"],
    },
  },
];

export interface ToolExecutionResult {
  resultText: string;
  pendingAction?: { toolName: string; args: Record<string, unknown>; description: string };
}

async function findQuotationByNumber(numberFragment: string) {
  return prisma.quotation.findFirst({
    where: { deletedAt: null, number: { contains: numberFragment, mode: "insensitive" } },
    select: {
      id: true, number: true, revision: true, status: true, grandTotal: true,
      customer: { select: { companyName: true } },
      submittedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function findInvoiceByNumber(numberFragment: string) {
  return prisma.invoice.findFirst({
    where: { deletedAt: null, number: { contains: numberFragment, mode: "insensitive" } },
    select: {
      id: true, number: true, status: true, grandTotal: true, dueDate: true,
      customer: { select: { companyName: true } },
      submittedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function findVendorPOByNumber(numberFragment: string) {
  return prisma.vendorPurchaseOrder.findFirst({
    where: { deletedAt: null, number: { contains: numberFragment, mode: "insensitive" } },
    select: {
      id: true, number: true, status: true, grandTotal: true, vendorName: true,
      submittedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function resolveProjectId(projectNumberRaw: string | undefined): Promise<{ id: string; number: string } | null | undefined> {
  if (!projectNumberRaw) return undefined;
  const project = await prisma.project.findFirst({
    where: { deletedAt: null, number: { contains: projectNumberRaw, mode: "insensitive" } },
    select: { id: true, number: true },
  });
  return project ?? null;
}

/** Finds a document by (fuzzy) name, optionally scoped to one project's folders. Returns the doc, a disambiguation note, or a not-found note. */
async function findDocumentByQuery(
  nameQuery: string,
  projectId: string | null | undefined
): Promise<{ doc: { id: string; originalName: string; folderId: string | null; folder: { path: string } | null } } | { note: string }> {
  const candidates = await prisma.document.findMany({
    where: {
      deletedAt: null,
      originalName: { contains: nameQuery, mode: "insensitive" },
      ...(projectId ? { folder: { projectId } } : {}),
    },
    select: { id: true, originalName: true, folderId: true, folder: { select: { path: true } } },
    orderBy: { uploadedAt: "desc" },
    take: 6,
  });
  if (candidates.length === 0) return { note: `Dokumen dengan nama mengandung "${nameQuery}" tidak ditemukan.` };
  if (candidates.length > 1) {
    return {
      note: `Ada ${candidates.length} dokumen mirip "${nameQuery}": ${candidates.map((d) => d.originalName).join(", ")}. Sebutkan nama yang lebih spesifik.`,
    };
  }
  return { doc: candidates[0] };
}

async function findCostingByNumber(numberFragment: string) {
  return prisma.costingSheet.findFirst({
    where: { deletedAt: null, number: { contains: numberFragment, mode: "insensitive" } },
    include: {
      customer: { select: { companyName: true } },
      quotation: { select: { number: true } },
      sections: { include: { items: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function findExpenseByNumber(numberFragment: string) {
  return prisma.projectExpense.findFirst({
    where: { deletedAt: null, number: { contains: numberFragment, mode: "insensitive" } },
    select: {
      id: true, number: true, approvalStatus: true, category: true, total: true,
      project: { select: { name: true } },
      submittedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function executeAssistantTool(
  toolName: string,
  input: Record<string, unknown>,
  actor: SessionPayload,
  attachment?: AssistantAttachmentInput | null
): Promise<ToolExecutionResult> {
  switch (toolName) {
    case "get_quotation_status": {
      requirePermission(actor.role, "sales", "view");
      const q = await findQuotationByNumber(String(input.quotationNumber ?? ""));
      if (!q) return { resultText: `Quotation "${input.quotationNumber}" tidak ditemukan.` };
      return {
        resultText:
          `${q.number}${q.revision > 0 ? `.R${q.revision}` : ""} — ${q.customer.companyName}\n` +
          `Status: ${q.status}\nNilai: ${formatCurrency(Number(q.grandTotal))}\n` +
          `Submitted by: ${q.submittedBy?.name ?? "-"}`,
      };
    }

    case "list_pending_approvals": {
      requirePermission(actor.role, "sales", "view");
      const [quotations, invoices, vendorPOs, expenses] = await Promise.all([
        prisma.quotation.findMany({
          where: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
          select: { number: true, revision: true, grandTotal: true, customer: { select: { companyName: true } } },
          orderBy: { submittedAt: "asc" },
          take: 20,
        }),
        prisma.invoice.findMany({
          where: { deletedAt: null, status: "SUBMITTED" },
          select: { number: true, grandTotal: true, customer: { select: { companyName: true } } },
          orderBy: { submittedAt: "asc" },
          take: 20,
        }),
        prisma.vendorPurchaseOrder.findMany({
          where: { deletedAt: null, status: "SUBMITTED" },
          select: { number: true, grandTotal: true, vendorName: true },
          orderBy: { submittedAt: "asc" },
          take: 20,
        }),
        prisma.projectExpense.findMany({
          where: { deletedAt: null, approvalStatus: "SUBMITTED" },
          select: { number: true, total: true, project: { select: { name: true } } },
          orderBy: { submittedAt: "asc" },
          take: 20,
        }),
      ]);

      if (quotations.length + invoices.length + vendorPOs.length + expenses.length === 0) {
        return { resultText: "Tidak ada dokumen apapun yang menunggu approval saat ini." };
      }

      const sections: string[] = [];
      if (quotations.length > 0) {
        sections.push(
          `Quotation:\n` +
            quotations
              .map((q) => `- ${q.number}${q.revision > 0 ? `.R${q.revision}` : ""} — ${q.customer.companyName} — ${formatCurrency(Number(q.grandTotal))}`)
              .join("\n")
        );
      }
      if (invoices.length > 0) {
        sections.push(
          `Invoice:\n` + invoices.map((i) => `- ${i.number} — ${i.customer.companyName} — ${formatCurrency(Number(i.grandTotal))}`).join("\n")
        );
      }
      if (vendorPOs.length > 0) {
        sections.push(
          `Vendor PO:\n` + vendorPOs.map((p) => `- ${p.number} — ${p.vendorName} — ${formatCurrency(Number(p.grandTotal))}`).join("\n")
        );
      }
      if (expenses.length > 0) {
        sections.push(
          `Project Expense:\n` +
            expenses.map((e) => `- ${e.number} — ${e.project.name} — ${formatCurrency(Number(e.total))}`).join("\n")
        );
      }
      return { resultText: sections.join("\n\n") };
    }

    case "get_project_status": {
      requirePermission(actor.role, "project", "view");
      const p = await prisma.project.findFirst({
        where: { deletedAt: null, number: { contains: String(input.projectNumber ?? ""), mode: "insensitive" } },
        select: {
          number: true, name: true, status: true, progressPercent: true, endDate: true,
          customer: { select: { companyName: true } },
          projectManager: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!p) return { resultText: `Project "${input.projectNumber}" tidak ditemukan.` };
      return {
        resultText:
          `${p.number} — ${p.name} (${p.customer.companyName})\n` +
          `Status: ${p.status} — Progress: ${p.progressPercent}%\n` +
          `PM: ${p.projectManager?.name ?? "-"} — Deadline: ${p.endDate ? formatDate(p.endDate) : "-"}`,
      };
    }

    case "get_invoice_status": {
      requirePermission(actor.role, "finance", "view");
      const inv = await findInvoiceByNumber(String(input.invoiceNumber ?? ""));
      if (!inv) return { resultText: `Invoice "${input.invoiceNumber}" tidak ditemukan.` };
      return {
        resultText:
          `${inv.number} — ${inv.customer.companyName}\n` +
          `Status: ${inv.status}\nNilai: ${formatCurrency(Number(inv.grandTotal))}\nJatuh tempo: ${formatDate(inv.dueDate)}\n` +
          `Submitted by: ${inv.submittedBy?.name ?? "-"}`,
      };
    }

    case "get_vendor_po_status": {
      requirePermission(actor.role, "sales", "view");
      const po = await findVendorPOByNumber(String(input.poNumber ?? ""));
      if (!po) return { resultText: `Vendor PO "${input.poNumber}" tidak ditemukan.` };
      return {
        resultText:
          `${po.number} — ${po.vendorName}\n` +
          `Status: ${po.status}\nNilai: ${formatCurrency(Number(po.grandTotal))}\n` +
          `Submitted by: ${po.submittedBy?.name ?? "-"}`,
      };
    }

    case "get_expense_status": {
      requirePermission(actor.role, "project", "view");
      const exp = await findExpenseByNumber(String(input.expenseNumber ?? ""));
      if (!exp) return { resultText: `Expense "${input.expenseNumber}" tidak ditemukan.` };
      return {
        resultText:
          `${exp.number} — ${exp.project.name} (${exp.category})\n` +
          `Status: ${exp.approvalStatus}\nNilai: ${formatCurrency(Number(exp.total))}\n` +
          `Submitted by: ${exp.submittedBy?.name ?? "-"}`,
      };
    }

    case "get_billing_schedule": {
      requirePermission(actor.role, "finance", "view");
      const projects = await prisma.project.findMany({
        where: { deletedAt: null },
        select: {
          id: true, number: true,
          customer: { select: { companyName: true } },
          purchaseOrders: {
            where: { deletedAt: null },
            select: { id: true, number: true, poValue: true, status: true, paymentTerms: true, estimatedDeliveryDate: true },
          },
          invoices: { where: { deletedAt: null }, select: { grandTotal: true, dpPercent: true, status: true } },
        },
      });
      const rows = computeBillingSchedule(projects);
      if (rows.length === 0) return { resultText: "Tidak ada project dengan sisa tagihan saat ini — semua sudah full di-invoice." };
      return {
        resultText: rows
          .slice(0, 30)
          .map(
            (r) =>
              `- ${r.projectNumber} — ${r.customerName}: sisa ${formatCurrency(r.remainingToBill)} (PO ${formatCurrency(r.totalPoValue)}, sudah invoice ${formatCurrency(r.totalInvoiced)})` +
              (r.nextBillingDate ? ` — target ${formatDate(r.nextBillingDate)}` : "")
          )
          .join("\n"),
      };
    }

    case "list_projects": {
      requirePermission(actor.role, "project", "view");
      const rows = await prisma.project.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: String(input.status) as never } : {}),
          ...(input.customerName ? { customer: { companyName: { contains: String(input.customerName), mode: "insensitive" } } } : {}),
        },
        select: { number: true, name: true, status: true, progressPercent: true, customer: { select: { companyName: true } } },
        orderBy: { createdAt: "desc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada project yang cocok." };
      return { resultText: rows.map((p) => `- ${p.number} — ${p.name} (${p.customer.companyName}) — ${p.status}, progress ${p.progressPercent}%`).join("\n") };
    }

    case "list_invoices": {
      requirePermission(actor.role, "finance", "view");
      const rows = await prisma.invoice.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: String(input.status) as never } : {}),
          ...(input.customerName ? { customer: { companyName: { contains: String(input.customerName), mode: "insensitive" } } } : {}),
          ...(input.projectNumber ? { project: { number: { contains: String(input.projectNumber), mode: "insensitive" } } } : {}),
        },
        select: { number: true, status: true, grandTotal: true, dueDate: true, customer: { select: { companyName: true } } },
        orderBy: { createdAt: "desc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada invoice yang cocok." };
      return {
        resultText: rows
          .map((i) => `- ${i.number} — ${i.customer.companyName} — ${i.status} — ${formatCurrency(Number(i.grandTotal))} — jatuh tempo ${formatDate(i.dueDate)}`)
          .join("\n"),
      };
    }

    case "list_quotations": {
      requirePermission(actor.role, "sales", "view");
      const rows = await prisma.quotation.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: String(input.status) as never } : {}),
          ...(input.customerName ? { customer: { companyName: { contains: String(input.customerName), mode: "insensitive" } } } : {}),
        },
        select: { number: true, revision: true, status: true, grandTotal: true, customer: { select: { companyName: true } } },
        orderBy: { createdAt: "desc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada quotation yang cocok." };
      return {
        resultText: rows
          .map((q) => `- ${q.number}${q.revision > 0 ? `.R${q.revision}` : ""} — ${q.customer.companyName} — ${q.status} — ${formatCurrency(Number(q.grandTotal))}`)
          .join("\n"),
      };
    }

    case "list_vendor_pos": {
      requirePermission(actor.role, "sales", "view");
      const rows = await prisma.vendorPurchaseOrder.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: String(input.status) as never } : {}),
          ...(input.vendorName ? { vendorName: { contains: String(input.vendorName), mode: "insensitive" } } : {}),
        },
        select: { number: true, status: true, grandTotal: true, vendorName: true },
        orderBy: { createdAt: "desc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada Vendor PO yang cocok." };
      return { resultText: rows.map((p) => `- ${p.number} — ${p.vendorName} — ${p.status} — ${formatCurrency(Number(p.grandTotal))}`).join("\n") };
    }

    case "list_expenses": {
      requirePermission(actor.role, "project", "view");
      const rows = await prisma.projectExpense.findMany({
        where: {
          deletedAt: null,
          ...(input.approvalStatus ? { approvalStatus: String(input.approvalStatus) as never } : {}),
          ...(input.category ? { category: String(input.category) as never } : {}),
          ...(input.projectNumber ? { project: { number: { contains: String(input.projectNumber), mode: "insensitive" } } } : {}),
        },
        select: { number: true, approvalStatus: true, category: true, total: true, project: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada expense yang cocok." };
      return {
        resultText: rows
          .map((e) => `- ${e.number} — ${e.project.name} (${e.category}) — ${e.approvalStatus} — ${formatCurrency(Number(e.total))}`)
          .join("\n"),
      };
    }

    case "search_customers": {
      requirePermission(actor.role, "sales", "view");
      const rows = await prisma.customer.findMany({
        where: { deletedAt: null, companyName: { contains: String(input.query ?? ""), mode: "insensitive" } },
        select: { companyName: true, city: true },
        orderBy: { companyName: "asc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada customer yang cocok." };
      return { resultText: rows.map((c) => `- ${c.companyName}${c.city ? ` (${c.city})` : ""}`).join("\n") };
    }

    case "approve_quotation": {
      const q = await findQuotationByNumber(String(input.quotationNumber ?? ""));
      if (!q) return { resultText: `Quotation "${input.quotationNumber}" tidak ditemukan.` };
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(q.status)) {
        return { resultText: `${q.number} berstatus ${q.status}, tidak sedang menunggu approval.` };
      }
      return {
        resultText: "Menunggu konfirmasi user sebelum approve benar-benar dijalankan.",
        pendingAction: {
          toolName: "approve_quotation",
          args: { quotationId: q.id },
          description: `Approve ${q.number} — ${q.customer.companyName} (${formatCurrency(Number(q.grandTotal))})`,
        },
      };
    }

    case "reject_quotation": {
      const q = await findQuotationByNumber(String(input.quotationNumber ?? ""));
      if (!q) return { resultText: `Quotation "${input.quotationNumber}" tidak ditemukan.` };
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(q.status)) {
        return { resultText: `${q.number} berstatus ${q.status}, tidak sedang menunggu approval.` };
      }
      const reason = String(input.reason ?? "").trim();
      if (!reason) return { resultText: "Sebutkan alasan penolakan terlebih dahulu." };
      return {
        resultText: "Menunggu konfirmasi user sebelum reject benar-benar dijalankan.",
        pendingAction: {
          toolName: "reject_quotation",
          args: { quotationId: q.id, reason },
          description: `Reject ${q.number} — ${q.customer.companyName}. Alasan: ${reason}`,
        },
      };
    }

    case "approve_invoice": {
      const inv = await findInvoiceByNumber(String(input.invoiceNumber ?? ""));
      if (!inv) return { resultText: `Invoice "${input.invoiceNumber}" tidak ditemukan.` };
      if (inv.status !== "SUBMITTED") {
        return { resultText: `${inv.number} berstatus ${inv.status}, tidak sedang menunggu approval.` };
      }
      return {
        resultText: "Menunggu konfirmasi user sebelum approve benar-benar dijalankan.",
        pendingAction: {
          toolName: "approve_invoice",
          args: { invoiceId: inv.id },
          description: `Approve ${inv.number} — ${inv.customer.companyName} (${formatCurrency(Number(inv.grandTotal))})`,
        },
      };
    }

    case "reject_invoice": {
      const inv = await findInvoiceByNumber(String(input.invoiceNumber ?? ""));
      if (!inv) return { resultText: `Invoice "${input.invoiceNumber}" tidak ditemukan.` };
      if (inv.status !== "SUBMITTED") {
        return { resultText: `${inv.number} berstatus ${inv.status}, tidak sedang menunggu approval.` };
      }
      const reason = String(input.reason ?? "").trim();
      if (!reason) return { resultText: "Sebutkan alasan penolakan terlebih dahulu." };
      return {
        resultText: "Menunggu konfirmasi user sebelum reject benar-benar dijalankan.",
        pendingAction: {
          toolName: "reject_invoice",
          args: { invoiceId: inv.id, reason },
          description: `Reject ${inv.number} — ${inv.customer.companyName}. Alasan: ${reason}`,
        },
      };
    }

    case "approve_vendor_po": {
      const po = await findVendorPOByNumber(String(input.poNumber ?? ""));
      if (!po) return { resultText: `Vendor PO "${input.poNumber}" tidak ditemukan.` };
      if (po.status !== "SUBMITTED") {
        return { resultText: `${po.number} berstatus ${po.status}, tidak sedang menunggu approval.` };
      }
      return {
        resultText: "Menunggu konfirmasi user sebelum approve benar-benar dijalankan.",
        pendingAction: {
          toolName: "approve_vendor_po",
          args: { poId: po.id },
          description: `Approve ${po.number} — ${po.vendorName} (${formatCurrency(Number(po.grandTotal))})`,
        },
      };
    }

    case "reject_vendor_po": {
      const po = await findVendorPOByNumber(String(input.poNumber ?? ""));
      if (!po) return { resultText: `Vendor PO "${input.poNumber}" tidak ditemukan.` };
      if (po.status !== "SUBMITTED") {
        return { resultText: `${po.number} berstatus ${po.status}, tidak sedang menunggu approval.` };
      }
      const reason = String(input.reason ?? "").trim();
      if (!reason) return { resultText: "Sebutkan alasan penolakan terlebih dahulu." };
      return {
        resultText: "Menunggu konfirmasi user sebelum reject benar-benar dijalankan.",
        pendingAction: {
          toolName: "reject_vendor_po",
          args: { poId: po.id, reason },
          description: `Reject ${po.number} — ${po.vendorName}. Alasan: ${reason}`,
        },
      };
    }

    case "approve_expense": {
      const exp = await findExpenseByNumber(String(input.expenseNumber ?? ""));
      if (!exp) return { resultText: `Expense "${input.expenseNumber}" tidak ditemukan.` };
      if (exp.approvalStatus !== "SUBMITTED") {
        return { resultText: `${exp.number} berstatus ${exp.approvalStatus}, tidak sedang menunggu approval.` };
      }
      return {
        resultText: "Menunggu konfirmasi user sebelum approve benar-benar dijalankan.",
        pendingAction: {
          toolName: "approve_expense",
          args: { expenseId: exp.id },
          description: `Approve ${exp.number} — ${exp.project.name} (${formatCurrency(Number(exp.total))})`,
        },
      };
    }

    case "reject_expense": {
      const exp = await findExpenseByNumber(String(input.expenseNumber ?? ""));
      if (!exp) return { resultText: `Expense "${input.expenseNumber}" tidak ditemukan.` };
      if (exp.approvalStatus !== "SUBMITTED") {
        return { resultText: `${exp.number} berstatus ${exp.approvalStatus}, tidak sedang menunggu approval.` };
      }
      const reason = String(input.reason ?? "").trim();
      if (!reason) return { resultText: "Sebutkan alasan penolakan terlebih dahulu." };
      return {
        resultText: "Menunggu konfirmasi user sebelum reject benar-benar dijalankan.",
        pendingAction: {
          toolName: "reject_expense",
          args: { expenseId: exp.id, reason },
          description: `Reject ${exp.number} — ${exp.project.name}. Alasan: ${reason}`,
        },
      };
    }

    case "create_costing_sheet": {
      requirePermission(actor.role, "sales", "create");

      const rawItems = Array.isArray(input.items) ? (input.items as Record<string, unknown>[]) : [];
      if (rawItems.length === 0) return { resultText: "Sebutkan minimal 1 item (nama, qty, unit, harga modal, margin%)." };

      const items: CostingLineItemInput[] = [];
      for (const raw of rawItems) {
        const name = String(raw.name ?? "").trim();
        const quantity = Number(raw.quantity);
        const unit = String(raw.unit ?? "").trim();
        const costUnitPrice = Number(raw.costUnitPrice);
        const marginPercent = Number(raw.marginPercent);
        if (!name || !unit || !Number.isFinite(quantity) || !Number.isFinite(costUnitPrice) || !Number.isFinite(marginPercent)) {
          return { resultText: `Item "${name || "(tanpa nama)"}" belum lengkap — sebutkan nama, qty, unit, harga modal, dan margin% secara eksplisit.` };
        }
        items.push({
          name,
          quantity,
          unit,
          currency: "IDR",
          costUnitPrice,
          supplierDiscountPercent: Number.isFinite(Number(raw.supplierDiscountPercent)) ? Number(raw.supplierDiscountPercent) : 0,
          marginPercent,
        });
      }

      const customerName = String(input.customerName ?? "");
      const candidates = await searchCustomerCandidates(customerName);
      if (candidates.length === 0) return { resultText: `Customer "${customerName}" tidak ditemukan.` };
      if (candidates.length > 1) {
        return { resultText: `Ada ${candidates.length} customer mirip "${customerName}": ${candidates.map((c) => c.companyName).join(", ")}. Sebutkan salah satu nama persis.` };
      }
      const customer = candidates[0];

      const projectTitle = String(input.projectTitle ?? "").trim();
      if (!projectTitle) return { resultText: "Sebutkan judul project untuk costing ini." };
      const jobNo = input.jobNo ? String(input.jobNo) : null;
      const operationalCost = Number.isFinite(Number(input.operationalCost)) ? Number(input.operationalCost) : 0;

      const summary = calcCostingSummary([{ items }], { operationalCost });
      return {
        resultText: "Menunggu konfirmasi user sebelum costing sheet benar-benar dibuat.",
        pendingAction: {
          toolName: "create_costing_sheet",
          args: { customerId: customer.id, projectTitle, jobNo, operationalCost, items },
          description:
            `Buat costing baru — ${customer.companyName} / ${projectTitle} (${items.length} item)\n` +
            `Total jual: ${formatCurrency(summary.totalRevenue)} — Margin: ${summary.grossMarginPercent}%`,
        },
      };
    }

    case "convert_costing_to_quotation": {
      requirePermission(actor.role, "sales", "create");
      const sheet = await findCostingByNumber(String(input.costingNumber ?? ""));
      if (!sheet) return { resultText: `Costing sheet "${input.costingNumber}" tidak ditemukan.` };
      if (sheet.status === "CONVERTED") {
        return { resultText: `${sheet.number} sudah dikonversi menjadi quotation ${sheet.quotation?.number ?? "-"}.` };
      }
      const summary = calcCostingSummary(
        sheet.sections.map((s) => ({
          items: s.items.map((i) => ({
            quantity: Number(i.quantity), costUnitPrice: Number(i.costUnitPrice),
            supplierDiscountPercent: Number(i.supplierDiscountPercent), marginPercent: Number(i.marginPercent),
          })),
        }))
      );

      let contactId: string | null = null;
      if (input.contactName) {
        const contacts = await prisma.contact.findMany({
          where: { customerId: sheet.customerId, name: { contains: String(input.contactName), mode: "insensitive" } },
          select: { id: true, name: true },
          take: 5,
        });
        if (contacts.length === 0) return { resultText: `Kontak "${input.contactName}" tidak ditemukan di customer ini.` };
        if (contacts.length > 1) {
          return { resultText: `Ada ${contacts.length} kontak mirip "${input.contactName}": ${contacts.map((c) => c.name).join(", ")}. Sebutkan salah satu nama persis.` };
        }
        contactId = contacts[0].id;
      }

      const validUntilDays = Number.isFinite(Number(input.validUntilDays)) ? Number(input.validUntilDays) : 30;
      const validUntil = new Date(Date.now() + validUntilDays * 24 * 60 * 60 * 1000);

      return {
        resultText: "Menunggu konfirmasi user sebelum quotation benar-benar dibuat.",
        pendingAction: {
          toolName: "convert_costing_to_quotation",
          args: { costingId: sheet.id, salesPicId: actor.userId, contactId, validUntil: validUntil.toISOString() },
          description:
            `Buat quotation dari costing ${sheet.number} — ${sheet.customer.companyName} (${formatCurrency(summary.totalRevenue)})\n` +
            `Berlaku sampai: ${formatDate(validUntil)}` +
            (contactId ? `\nPIC: ${String(input.contactName)}` : ""),
        },
      };
    }

    case "revise_quotation": {
      requirePermission(actor.role, "sales", "update");
      const quotationNumber = String(input.quotationNumber ?? "");
      const adjustmentType = String(input.adjustmentType ?? "");

      let action: RevisionAction;
      if (adjustmentType === "percent_adjustment") {
        const percent = Number(input.percent);
        if (!Number.isFinite(percent)) return { resultText: "Sebutkan berapa persen kenaikan/penurunan harganya." };
        action = { type: "percent_adjustment", percent };
      } else if (adjustmentType === "operational_cost_delta") {
        const amount = Number(input.amount);
        if (!Number.isFinite(amount)) return { resultText: "Sebutkan berapa Rupiah perubahan biaya operasionalnya." };
        action = { type: "operational_cost_delta", amount };
      } else if (adjustmentType === "item_quantity") {
        const itemName = String(input.itemName ?? "").trim();
        const quantity = Number(input.quantity);
        if (!itemName || !Number.isFinite(quantity)) return { resultText: "Sebutkan nama item dan quantity baru-nya." };
        action = { type: "item_quantity", itemName, quantity };
      } else {
        return { resultText: "Jenis revisi tidak didukung — hanya bisa naik/turun harga %, ubah biaya operasional, atau ubah qty satu item." };
      }

      const sim = await simulateQuotationRevision(quotationNumber, action);
      if (!sim.ok) return { resultText: sim.error ?? "Gagal mensimulasikan revisi." };
      return {
        resultText: "Menunggu konfirmasi user sebelum revisi benar-benar dijalankan.",
        pendingAction: {
          toolName: "revise_quotation",
          args: { costingId: sim.costingId, action },
          description: cleanPreview(sim.previewText ?? ""),
        },
      };
    }

    case "create_invoice": {
      requirePermission(actor.role, "finance", "create");
      const projectNumberRaw = String(input.projectNumber ?? "");
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { resultText: 'Sebutkan jumlah tagihan dalam Rupiah secara eksplisit (bukan persen), mis. "sebesar Rp150.000.000".' };
      }

      const project = await prisma.project.findFirst({
        where: { deletedAt: null, number: { contains: projectNumberRaw, mode: "insensitive" } },
        select: { id: true, number: true, name: true, customerId: true, quotationId: true, jobNumber: true },
      });
      if (!project) return { resultText: `Project "${projectNumberRaw}" tidak ditemukan.` };

      const existingInvoiceCount = await prisma.invoice.count({
        where: { projectId: project.id, status: { not: "CANCELLED" }, deletedAt: null },
      });
      const isFirstInvoice = existingInvoiceCount === 0;
      const quotationId = isFirstInvoice ? project.quotationId : null;
      const quotation = quotationId
        ? await prisma.quotation.findUnique({
            where: { id: quotationId },
            select: { number: true, description: true, contactId: true, salesPicId: true },
          })
        : null;

      const dpPercent = input.dpPercent != null ? Number(input.dpPercent) : null;
      const dueInDays = Number.isFinite(Number(input.dueInDays)) ? Number(input.dueInDays) : 30;
      const dueDate = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);
      const taxPercent = Number.isFinite(Number(input.taxPercent)) ? Number(input.taxPercent) : 11;

      let contactId: string | null = quotation?.contactId ?? null;
      if (input.contactName) {
        const contacts = await prisma.contact.findMany({
          where: { customerId: project.customerId, name: { contains: String(input.contactName), mode: "insensitive" } },
          select: { id: true, name: true },
          take: 5,
        });
        if (contacts.length === 0) return { resultText: `PIC "${input.contactName}" tidak ditemukan di customer ini.` };
        if (contacts.length > 1) {
          return { resultText: `Ada ${contacts.length} kontak mirip "${input.contactName}": ${contacts.map((c) => c.name).join(", ")}. Sebutkan salah satu nama persis.` };
        }
        contactId = contacts[0].id;
      }

      const customerPO = input.customerPO ? String(input.customerPO) : null;
      const poDate = parseOptionalDate(input.poDate);
      if (poDate === "invalid") return { resultText: "Format tanggal PO tidak valid — gunakan format YYYY-MM-DD." };

      const scopeLabel = quotation?.description || project.name;
      const description = quotationId
        ? `Down Payment${dpPercent != null ? ` ${dpPercent}%` : ""} - ${scopeLabel}${quotation ? ` (Ref. Quotation ${quotation.number})` : ""}`
        : `Termin Pembayaran - ${scopeLabel}`;

      const totals = calcInvoiceTotals(
        [{ description, quantity: 1, unit: "lot", unitPrice: amount, taxPercent, isNote: false }],
        0
      );

      return {
        resultText: "Menunggu konfirmasi user sebelum invoice benar-benar dibuat.",
        pendingAction: {
          toolName: "create_invoice",
          args: {
            projectId: project.id, customerId: project.customerId, quotationId,
            contactId, jobNo: project.jobNumber, salesPicId: quotation?.salesPicId ?? null,
            dueDate: dueDate.toISOString(), customerPO, poDate: poDate ? poDate.toISOString() : null,
            dpPercent, taxPercent, description, amount,
          },
          description:
            `Invoice — ${project.number} (${scopeLabel})\n` +
            `${description}\n` +
            `Dasar: ${formatCurrency(amount)}${taxPercent > 0 ? ` + PPN ${taxPercent}% (${formatCurrency(totals.tax)})` : ""}\n` +
            `Total tagihan: ${formatCurrency(totals.grandTotal)}\n` +
            `Jatuh tempo: ${formatDate(dueDate)}` +
            (customerPO ? `\nCustomer PO: ${customerPO}${poDate ? ` (${formatDate(poDate)})` : ""}` : "") +
            (contactId ? `\nPIC: ${input.contactName ? String(input.contactName) : "(dari quotation)"}` : ""),
        },
      };
    }

    case "create_vendor_po": {
      requirePermission(actor.role, "sales", "create");
      const vendorName = String(input.vendorName ?? "").trim();
      if (!vendorName) return { resultText: "Sebutkan nama vendor/supplier." };

      const rawItems = Array.isArray(input.items) ? (input.items as Record<string, unknown>[]) : [];
      if (rawItems.length === 0) return { resultText: "Sebutkan minimal 1 item (deskripsi, qty, harga)." };
      const items: { description: string; quantity: number; unit: string; unitPrice: number }[] = [];
      for (const raw of rawItems) {
        const description = String(raw.description ?? "").trim();
        const quantity = Number(raw.quantity);
        const unitPrice = Number(raw.unitPrice);
        if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice)) {
          return { resultText: `Item "${description || "(tanpa deskripsi)"}" belum lengkap — sebutkan deskripsi, qty, dan harga per unit.` };
        }
        items.push({ description, quantity, unit: String(raw.unit ?? "lot"), unitPrice });
      }

      let projectId: string | null = null;
      if (input.projectNumber) {
        const project = await prisma.project.findFirst({
          where: { deletedAt: null, number: { contains: String(input.projectNumber), mode: "insensitive" } },
          select: { id: true, number: true },
        });
        if (!project) return { resultText: `Project "${input.projectNumber}" tidak ditemukan.` };
        projectId = project.id;
      }

      const taxPercent = Number.isFinite(Number(input.taxPercent)) ? Number(input.taxPercent) : 11;
      const discount = Number.isFinite(Number(input.discount)) ? Number(input.discount) : 0;
      const totals = calcVendorPoTotals(items, discount, taxPercent);

      return {
        resultText: "Menunggu konfirmasi user sebelum Vendor PO benar-benar dibuat.",
        pendingAction: {
          toolName: "create_vendor_po",
          args: {
            vendorName, items, taxPercent, discount, projectId,
            paymentTerms: input.paymentTerms ? String(input.paymentTerms) : null,
            deliveryTerms: input.deliveryTerms ? String(input.deliveryTerms) : null,
            notes: input.notes ? String(input.notes) : null,
          },
          description:
            `Buat Vendor PO — ${vendorName} (${items.length} item)\n` +
            `Total: ${formatCurrency(totals.grandTotal)} (termasuk PPN ${taxPercent}%)`,
        },
      };
    }

    case "create_progress_report": {
      requirePermission(actor.role, "project", "create");
      const project = await prisma.project.findFirst({
        where: { deletedAt: null, number: { contains: String(input.projectNumber ?? ""), mode: "insensitive" } },
        select: { id: true, number: true, name: true },
      });
      if (!project) return { resultText: `Project "${input.projectNumber}" tidak ditemukan.` };

      const rawItems = Array.isArray(input.items) ? (input.items as Record<string, unknown>[]) : [];
      if (rawItems.length === 0) return { resultText: "Sebutkan minimal 1 checkpoint (nama part/pekerjaan)." };
      const items: { partName: string; notes: string | null; isDone: boolean }[] = [];
      for (const raw of rawItems) {
        const partName = String(raw.partName ?? "").trim();
        if (!partName) return { resultText: "Setiap checkpoint harus punya nama part/pekerjaan." };
        items.push({ partName, notes: raw.notes ? String(raw.notes) : null, isDone: Boolean(raw.isDone) });
      }

      const inspectionDate = parseOptionalDate(input.inspectionDate);
      if (inspectionDate === "invalid") return { resultText: "Format tanggal inspeksi tidak valid — gunakan format YYYY-MM-DD." };

      return {
        resultText: "Menunggu konfirmasi user sebelum progress report benar-benar dibuat.",
        pendingAction: {
          toolName: "create_progress_report",
          args: {
            projectId: project.id,
            inspectionDate: (inspectionDate ?? new Date()).toISOString(),
            location: input.location ? String(input.location) : null,
            items,
          },
          description:
            `Buat progress report — ${project.number} (${project.name})\n` +
            `${items.length} checkpoint: ${items.map((i) => i.partName).join(", ")}\n` +
            `Foto before/after masih perlu diupload manual di app setelah ini.`,
        },
      };
    }

    case "create_progress_report_from_document": {
      requirePermission(actor.role, "project", "create");
      if (!attachment) {
        return { resultText: "Lampirkan dulu file PDF/foto laporannya di chat ini, baru minta buatkan progress report." };
      }
      if (!isExtractableMimeType(attachment.mimeType)) {
        return { resultText: `Tipe file "${attachment.mimeType}" tidak didukung — lampirkan PDF atau foto (JPG/PNG/WEBP).` };
      }
      const project = await prisma.project.findFirst({
        where: { deletedAt: null, number: { contains: String(input.projectNumber ?? ""), mode: "insensitive" } },
        select: { id: true, number: true, name: true },
      });
      if (!project) return { resultText: `Project "${input.projectNumber}" tidak ditemukan.` };

      return {
        resultText: "Menunggu konfirmasi user sebelum progress report benar-benar dibuat.",
        pendingAction: {
          toolName: "create_progress_report_from_document",
          args: {
            projectId: project.id,
            projectNumber: project.number,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            dataBase64: attachment.dataBase64,
          },
          description: `Upload "${attachment.fileName}" ke folder Progress Report project ${project.number}, lalu generate checklist progress report otomatis (standar SSO) dari isinya. File sumber akan tersimpan di folder Progress Report project ini.`,
        },
      };
    }

    case "get_progress_report": {
      requirePermission(actor.role, "project", "view");
      const project = await prisma.project.findFirst({
        where: { deletedAt: null, number: { contains: String(input.projectNumber ?? ""), mode: "insensitive" } },
        select: { id: true, number: true, name: true },
      });
      if (!project) return { resultText: `Project "${input.projectNumber}" tidak ditemukan.` };

      const report = await prisma.progressReport.findFirst({
        where: {
          projectId: project.id,
          ...(input.reportNumber ? { number: { contains: String(input.reportNumber), mode: "insensitive" } } : {}),
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
        orderBy: { inspectionDate: "desc" },
      });
      if (!report) {
        return {
          resultText: input.reportNumber
            ? `Progress report "${input.reportNumber}" tidak ditemukan untuk project ${project.number}.`
            : `Belum ada progress report untuk project ${project.number}.`,
        };
      }
      if (report.items.length === 0) {
        return { resultText: `${report.number} (${project.number}, ${formatDate(report.inspectionDate)}) belum punya checkpoint sama sekali.` };
      }
      const doneCount = report.items.filter((i) => i.isDone).length;
      return {
        resultText:
          `${report.number} — ${project.number} (${project.name}), inspeksi ${formatDate(report.inspectionDate)}${report.location ? ` di ${report.location}` : ""}\n` +
          `Selesai: ${doneCount}/${report.items.length}\n` +
          report.items
            .map((i) => `- [${i.isDone ? "x" : " "}] ${i.partName}${i.notes ? ` — ${i.notes}` : ""}`)
            .join("\n"),
      };
    }

    case "list_documents": {
      requirePermission(actor.role, "documents", "view");
      const project = await resolveProjectId(input.projectNumber ? String(input.projectNumber) : undefined);
      if (project === null) return { resultText: `Project "${input.projectNumber}" tidak ditemukan.` };

      const rows = await prisma.document.findMany({
        where: {
          deletedAt: null,
          ...(input.nameQuery ? { originalName: { contains: String(input.nameQuery), mode: "insensitive" } } : {}),
          folder: {
            ...(project ? { projectId: project.id } : {}),
            ...(input.folderQuery ? { path: { contains: String(input.folderQuery), mode: "insensitive" } } : {}),
          },
        },
        select: { originalName: true, mimeType: true, uploadedAt: true, folder: { select: { path: true } } },
        orderBy: { uploadedAt: "desc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada dokumen yang cocok." };
      return {
        resultText: rows
          .map((d) => `- ${d.originalName} — ${d.folder?.path ?? "(tanpa folder)"} — diupload ${formatDate(d.uploadedAt)}`)
          .join("\n"),
      };
    }

    case "rename_document": {
      requirePermission(actor.role, "documents", "update");
      const project = await resolveProjectId(input.projectNumber ? String(input.projectNumber) : undefined);
      if (project === null) return { resultText: `Project "${input.projectNumber}" tidak ditemukan.` };
      const found = await findDocumentByQuery(String(input.nameQuery ?? ""), project?.id);
      if ("note" in found) return { resultText: found.note };
      const newName = String(input.newName ?? "").trim();
      if (!newName) return { resultText: "Sebutkan nama file baru." };
      const reason = String(input.reason ?? "").trim();
      if (!reason) return { resultText: "Sebutkan alasan penggantian nama — ini wajib dan akan tercatat di log." };

      return {
        resultText: "Menunggu konfirmasi user sebelum nama file benar-benar diubah.",
        pendingAction: {
          toolName: "rename_document",
          args: { documentId: found.doc.id, newName, reason },
          description: `Ganti nama "${found.doc.originalName}" -> "${newName}" (${found.doc.folder?.path ?? "-"}). Alasan: ${reason}`,
        },
      };
    }

    case "move_document": {
      requirePermission(actor.role, "documents", "update");
      const project = await resolveProjectId(String(input.projectNumber ?? ""));
      if (!project) return { resultText: `Project "${input.projectNumber}" tidak ditemukan.` };
      const found = await findDocumentByQuery(String(input.nameQuery ?? ""), project.id);
      if ("note" in found) return { resultText: found.note };
      const reason = String(input.reason ?? "").trim();
      if (!reason) return { resultText: "Sebutkan alasan pemindahan — ini wajib dan akan tercatat di log." };

      const destFolders = await prisma.folder.findMany({
        where: { projectId: project.id, path: { contains: String(input.destinationFolderQuery ?? ""), mode: "insensitive" } },
        select: { id: true, path: true },
        take: 6,
      });
      if (destFolders.length === 0) return { resultText: `Folder tujuan mengandung "${input.destinationFolderQuery}" tidak ditemukan di project ${project.number}.` };
      if (destFolders.length > 1) {
        return { resultText: `Ada ${destFolders.length} folder mirip: ${destFolders.map((f) => f.path).join(", ")}. Sebutkan yang lebih spesifik.` };
      }

      return {
        resultText: "Menunggu konfirmasi user sebelum file benar-benar dipindah.",
        pendingAction: {
          toolName: "move_document",
          args: { documentId: found.doc.id, newFolderId: destFolders[0].id, reason },
          description: `Pindahkan "${found.doc.originalName}" dari "${found.doc.folder?.path ?? "-"}" ke "${destFolders[0].path}". Alasan: ${reason}`,
        },
      };
    }

    case "trash_document": {
      requirePermission(actor.role, "documents", "delete");
      const project = await resolveProjectId(input.projectNumber ? String(input.projectNumber) : undefined);
      if (project === null) return { resultText: `Project "${input.projectNumber}" tidak ditemukan.` };
      const found = await findDocumentByQuery(String(input.nameQuery ?? ""), project?.id);
      if ("note" in found) return { resultText: found.note };

      return {
        resultText: "Menunggu konfirmasi user sebelum file benar-benar dipindah ke Trash.",
        pendingAction: {
          toolName: "trash_document",
          args: { documentId: found.doc.id },
          description: `Pindahkan "${found.doc.originalName}" (${found.doc.folder?.path ?? "-"}) ke Trash — masih bisa dipulihkan lewat app.`,
        },
      };
    }

    default:
      return { resultText: `Tool "${toolName}" tidak dikenali.` };
  }
}

/** Runs the actual mutation for a confirmed write action. Re-checks permission itself (via the real workflow function) — never trusts that the assistant's earlier proposal was still valid. */
export async function runConfirmedAssistantAction(
  toolName: string,
  args: Record<string, unknown>,
  actor: SessionPayload
): Promise<string> {
  switch (toolName) {
    case "approve_quotation": {
      const q = await approveQuotation(String(args.quotationId), actor);
      return `${q.number} berhasil di-approve.`;
    }
    case "reject_quotation": {
      const q = await rejectQuotation(String(args.quotationId), String(args.reason), actor);
      return `${q.number} berhasil di-reject.`;
    }
    case "approve_invoice": {
      const inv = await approveInvoice(String(args.invoiceId), actor);
      return `${inv.number} berhasil di-approve.`;
    }
    case "reject_invoice": {
      const inv = await rejectInvoice(String(args.invoiceId), String(args.reason), actor);
      return `${inv.number} berhasil di-reject.`;
    }
    case "approve_vendor_po": {
      const po = await approveVendorPO(String(args.poId), actor);
      return `${po.number} berhasil di-approve.`;
    }
    case "reject_vendor_po": {
      const po = await rejectVendorPO(String(args.poId), String(args.reason), actor);
      return `${po.number} berhasil di-reject.`;
    }
    case "approve_expense": {
      const exp = await approveExpense(String(args.expenseId), actor);
      return `${exp.number} berhasil di-approve.`;
    }
    case "reject_expense": {
      const exp = await rejectExpense(String(args.expenseId), String(args.reason), actor);
      return `${exp.number} berhasil di-reject.`;
    }
    case "create_costing_sheet": {
      const items = args.items as CostingLineItemInput[];
      const input: CostingSheetInput = {
        customerId: String(args.customerId),
        projectTitle: String(args.projectTitle),
        jobNo: args.jobNo ? String(args.jobNo) : null,
        costingDate: new Date(),
        operationalCost: Number(args.operationalCost) || 0,
        ppnPercent: 11,
        pphFinalPercent: 2,
        sections: [{ code: "A", name: "UMUM", items }],
      };
      const sheet = await createCostingSheet(input, actor);
      return `${sheet.number} berhasil dibuat sebagai costing sheet DRAFT.`;
    }
    case "convert_costing_to_quotation": {
      const quotation = await convertCostingToQuotation(
        String(args.costingId),
        {
          salesPicId: String(args.salesPicId),
          contactId: args.contactId ? String(args.contactId) : undefined,
          validUntil: args.validUntil ? new Date(String(args.validUntil)) : undefined,
        },
        actor
      );
      return `Quotation ${quotation.number} berhasil dibuat.`;
    }
    case "revise_quotation": {
      const result = await commitQuotationRevision(String(args.costingId), args.action as RevisionAction, actor);
      return `Quotation ${result.quotationNumber} berhasil direvisi.`;
    }
    case "create_invoice": {
      const invoiceInput: InvoiceInput = {
        customerId: String(args.customerId),
        projectId: String(args.projectId),
        quotationId: args.quotationId ? String(args.quotationId) : null,
        contactId: args.contactId ? String(args.contactId) : null,
        invoiceDate: new Date(),
        dueDate: new Date(String(args.dueDate)),
        customerPO: args.customerPO ? String(args.customerPO) : null,
        poDate: args.poDate ? new Date(String(args.poDate)) : null,
        deliveryDate: null,
        jobNo: args.jobNo ? String(args.jobNo) : null,
        salesPicId: args.salesPicId ? String(args.salesPicId) : null,
        notes: null,
        dpPercent: args.dpPercent != null ? Number(args.dpPercent) : null,
        discount: 0,
        items: [
          {
            description: String(args.description),
            quantity: 1,
            unit: "lot",
            unitPrice: Number(args.amount),
            taxPercent: Number(args.taxPercent) || 0,
            isNote: false,
          },
        ],
      };
      const invoice = await createInvoice(invoiceInput, actor);
      return `${invoice.number} berhasil dibuat sebagai DRAFT (Total: ${formatCurrency(Number(invoice.grandTotal))}).`;
    }
    case "create_vendor_po": {
      const items = args.items as { description: string; quantity: number; unit: string; unitPrice: number }[];
      const poInput: VendorPurchaseOrderInput = {
        vendorName: String(args.vendorName),
        poDate: new Date(),
        projectId: args.projectId ? String(args.projectId) : null,
        discount: Number(args.discount) || 0,
        taxPercent: Number(args.taxPercent) || 0,
        paymentTerms: args.paymentTerms ? String(args.paymentTerms) : null,
        deliveryTerms: args.deliveryTerms ? String(args.deliveryTerms) : null,
        notes: args.notes ? String(args.notes) : null,
        items,
      };
      const po = await createVendorPurchaseOrder(poInput, actor);
      return `${po.number} berhasil dibuat sebagai DRAFT (Total: ${formatCurrency(Number(po.grandTotal))}).`;
    }
    case "create_progress_report": {
      const items = args.items as { partName: string; notes: string | null; isDone: boolean }[];
      const report = await createProgressReport(
        {
          projectId: String(args.projectId),
          inspectionDate: new Date(String(args.inspectionDate)),
          location: args.location ? String(args.location) : null,
          preparedById: actor.userId,
        },
        actor.userId
      );
      for (let i = 0; i < items.length; i++) {
        await addProgressReportItem(
          { progressReportId: report.id, partName: items[i].partName, notes: items[i].notes, isDone: items[i].isDone, sortOrder: i },
          {},
          actor.userId
        );
      }
      return `${report.number} berhasil dibuat dengan ${items.length} checkpoint.`;
    }
    case "create_progress_report_from_document": {
      const projectId = String(args.projectId);
      const buffer = Buffer.from(String(args.dataBase64), "base64");
      const folder = await prisma.folder.findFirst({ where: { projectId, routeKey: "PROJECT/PROGRESS_REPORT" } });
      const doc = await uploadDocument(
        {
          buffer,
          originalName: String(args.fileName),
          mimeType: String(args.mimeType),
          folderId: folder?.id,
          projectId,
          relatedEntityType: "PROGRESS_REPORT",
        },
        actor
      );
      const result = await generateProgressReportFromDocument(doc.id, projectId);
      if (!result.ok) throw new Error(result.error);
      const report = await prisma.progressReport.findUniqueOrThrow({ where: { id: result.data.progressReportId } });
      return `${report.number} berhasil dibuat dari file "${args.fileName}" (file sumber tersimpan di folder Progress Report project ${args.projectNumber}). Buka halaman Progress Report project ini di app untuk lihat/cetak PDF-nya.`;
    }
    case "rename_document": {
      await renameDocumentFile(String(args.documentId), String(args.newName), String(args.reason), actor);
      return `Nama file berhasil diubah menjadi "${args.newName}".`;
    }
    case "move_document": {
      await relocateDocument(String(args.documentId), String(args.newFolderId), String(args.reason), actor);
      return "File berhasil dipindahkan.";
    }
    case "trash_document": {
      const doc = await moveDocumentToTrash(String(args.documentId), actor);
      return `"${doc.originalName}" berhasil dipindahkan ke Trash (masih bisa dipulihkan lewat app).`;
    }
    default:
      throw new ForbiddenError(`Aksi "${toolName}" tidak dikenali.`);
  }
}
