"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { Pencil, Search, Upload, TriangleAlert } from "lucide-react";
import { formatCurrency, formatRevisedNumber, formatDate } from "@/lib/utils";
import {
  correctQuotationNumberAction,
  correctVendorPONumberAction,
  correctInvoiceNumberAction,
  correctProgressReportAction,
  renameDocumentAction,
  relocateDocumentAction,
  searchDocumentsForCorrection,
  correctOpportunityStageAction,
  archiveWonArtifactsAction,
  revertContractToDraftAction,
  revertMilestoneToPendingAction,
  attachPaymentEvidenceAction,
} from "@/server/corrections";

type Quotation = { id: string; number: string; revision: number; status: string; quotationDate: string; customer: { companyName: string } | null };
type VendorPO = { id: string; number: string; status: string; poDate: string; vendorName: string; project: { number: string } | null };
type Invoice = { id: string; number: string; status: string; invoiceDate: string; customer: { companyName: string } | null };
type ProgressReport = { id: string; number: string; title: string | null; reportKind: string | null; inspectionDate: string; project: { number: string } | null };
type FolderOpt = { id: string; path: string };
type DocRow = { id: string; originalName: string; mimeType: string; uploadedAt: string; relatedEntityType: string | null; folder: { id: string; path: string } | null };
type WonLostOpportunity = {
  id: string; number: string; name: string; status: string; updatedAt: string;
  customer: { companyName: string } | null;
  quotations: { id: string; number: string; revision: number; status: string; grandTotal: string }[];
  costingSheets: { id: string; number: string; revision: number; status: string; quotationId: string | null }[];
  projects: { id: string; number: string }[];
};

type MissingEvidenceInvoice = {
  id: string; number: string; status: string; grandTotal: string; paidAmount: string;
  customer: { companyName: string } | null;
  payments: { id: string; invoiceId: string; number: string; paymentDate: string; amount: string; hasDocument: boolean }[];
};
type MissingEvidenceContract = { id: string; number: string; contractValue: string; customer: { companyName: string } | null };
type MissingEvidenceMilestone = { id: string; name: string; dueDate: string | null; project: { number: string; name: string } | null };
type MissingEvidenceQuotation = { id: string; number: string; revision: number; customer: { companyName: string } | null };
type MissingEvidence = {
  invoicesMissingEvidence: MissingEvidenceInvoice[];
  contractsMissingEvidence: MissingEvidenceContract[];
  milestonesMissingEvidence: MissingEvidenceMilestone[];
  quotationsMissingEvidence: MissingEvidenceQuotation[];
};

interface Props {
  quotations: Quotation[];
  vendorPOs: VendorPO[];
  invoices: Invoice[];
  progressReports: ProgressReport[];
  folders: FolderOpt[];
  wonLostOpportunities: WonLostOpportunity[];
  missingEvidence: MissingEvidence;
}

const TABS = [
  { value: "quotation", label: "Penawaran" },
  { value: "vendorpo", label: "Pesanan ke Vendor" },
  { value: "invoice", label: "Invoice" },
  { value: "progress", label: "Progress Report" },
  { value: "document", label: "Dokumen (Nama & Lokasi)" },
  { value: "opportunity", label: "Status Deal (Won/Lost)" },
  { value: "evidence", label: "Audit Bukti Dokumen" },
];

function useFilter<T>(rows: T[], toText: (r: T) => string) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => toText(r).toLowerCase().includes(needle));
  }, [rows, q, toText]);
  return { q, setQ, filtered };
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  );
}

export function DocumentCorrectionPanel({ quotations, vendorPOs, invoices, progressReports, folders, wonLostOpportunities, missingEvidence }: Props) {
  const [tab, setTab] = useState("quotation");
  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "quotation" && <QuotationTab rows={quotations} />}
      {tab === "vendorpo" && <VendorPOTab rows={vendorPOs} />}
      {tab === "invoice" && <InvoiceTab rows={invoices} />}
      {tab === "progress" && <ProgressReportTab rows={progressReports} />}
      {tab === "document" && <DocumentTab folders={folders} />}
      {tab === "opportunity" && <OpportunityStageTab rows={wonLostOpportunities} />}
      {tab === "evidence" && <AuditEvidenceTab data={missingEvidence} />}
    </div>
  );
}

// ---------------------------------------------------------------- Quotation
function QuotationTab({ rows }: { rows: Quotation[] }) {
  const { q, setQ, filtered } = useFilter(rows, (r) => `${r.number} ${r.customer?.companyName ?? ""}`);
  const [editing, setEditing] = useState<Quotation | null>(null);
  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder="Cari nomor atau nama pelanggan..." />
      {filtered.length === 0 ? (
        <EmptyState title="Tidak ada penawaran" description="Coba kata kunci lain." />
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Nomor</TableHead><TableHead>Pelanggan</TableHead><TableHead>Status</TableHead><TableHead>Tanggal</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.number}{r.revision > 0 ? `.R${r.revision}` : ""}</TableCell>
                <TableCell>{r.customer?.companyName ?? "-"}</TableCell>
                <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                <TableCell>{new Date(r.quotationDate).toLocaleDateString("id-ID")}</TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && (
        <NumberCorrectionDialog
          title="Koreksi Nomor Penawaran"
          currentNumber={editing.number}
          onClose={() => setEditing(null)}
          onSave={(newNumber, reason) => correctQuotationNumberAction(editing.id, newNumber, reason)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Vendor PO
function VendorPOTab({ rows }: { rows: VendorPO[] }) {
  const { q, setQ, filtered } = useFilter(rows, (r) => `${r.number} ${r.vendorName} ${r.project?.number ?? ""}`);
  const [editing, setEditing] = useState<VendorPO | null>(null);
  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder="Cari nomor, vendor, atau proyek..." />
      {filtered.length === 0 ? (
        <EmptyState title="Tidak ada pesanan vendor" description="Coba kata kunci lain." />
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Nomor</TableHead><TableHead>Vendor</TableHead><TableHead>Proyek</TableHead><TableHead>Status</TableHead><TableHead>Tanggal</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.number}</TableCell>
                <TableCell>{r.vendorName}</TableCell>
                <TableCell>{r.project?.number ?? "-"}</TableCell>
                <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                <TableCell>{new Date(r.poDate).toLocaleDateString("id-ID")}</TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && (
        <NumberCorrectionDialog
          title="Koreksi Nomor Pesanan Vendor"
          currentNumber={editing.number}
          onClose={() => setEditing(null)}
          onSave={(newNumber, reason) => correctVendorPONumberAction(editing.id, newNumber, reason)}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Invoice
function InvoiceTab({ rows }: { rows: Invoice[] }) {
  const { q, setQ, filtered } = useFilter(rows, (r) => `${r.number} ${r.customer?.companyName ?? ""}`);
  const [editing, setEditing] = useState<Invoice | null>(null);
  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder="Cari nomor atau nama pelanggan..." />
      {filtered.length === 0 ? (
        <EmptyState title="Tidak ada invoice" description="Coba kata kunci lain." />
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Nomor</TableHead><TableHead>Pelanggan</TableHead><TableHead>Status</TableHead><TableHead>Tanggal</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.number}</TableCell>
                <TableCell>{r.customer?.companyName ?? "-"}</TableCell>
                <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                <TableCell>{new Date(r.invoiceDate).toLocaleDateString("id-ID")}</TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && (
        <NumberCorrectionDialog
          title="Koreksi Nomor Invoice"
          currentNumber={editing.number}
          onClose={() => setEditing(null)}
          onSave={(newNumber, reason) => correctInvoiceNumberAction(editing.id, newNumber, reason)}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------- Progress Report
function ProgressReportTab({ rows }: { rows: ProgressReport[] }) {
  const { q, setQ, filtered } = useFilter(rows, (r) => `${r.number} ${r.title ?? ""} ${r.project?.number ?? ""}`);
  const [editing, setEditing] = useState<ProgressReport | null>(null);
  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder="Cari nomor, judul, atau proyek..." />
      {filtered.length === 0 ? (
        <EmptyState title="Tidak ada progress report" description="Coba kata kunci lain." />
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Nomor</TableHead><TableHead>Judul</TableHead><TableHead>Jenis</TableHead><TableHead>Proyek</TableHead><TableHead>Tanggal</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.number}</TableCell>
                <TableCell>{r.title ?? "-"}</TableCell>
                <TableCell><Badge variant="outline">{r.reportKind ?? "PROGRES"}</Badge></TableCell>
                <TableCell>{r.project?.number ?? "-"}</TableCell>
                <TableCell>{new Date(r.inspectionDate).toLocaleDateString("id-ID")}</TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && <ProgressReportCorrectionDialog row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProgressReportCorrectionDialog({ row, onClose }: { row: ProgressReport; onClose: () => void }) {
  const [number, setNumber] = useState(row.number);
  const [title, setTitle] = useState(row.title ?? "");
  const [reportKind, setReportKind] = useState(row.reportKind ?? "PROGRES");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSave() {
    setPending(true);
    const res = await correctProgressReportAction(row.id, { number, title: title || null, reportKind }, reason);
    setPending(false);
    if (res.ok) {
      toast({ title: "Progress report dikoreksi", variant: "success" });
      onClose();
      router.refresh();
    } else {
      toast({ title: "Gagal koreksi", description: res.error, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Koreksi Progress Report" description={`Nomor saat ini: ${row.number}`}>
      <div className="space-y-3">
        <div className="space-y-1"><Label>Nomor Dokumen</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} /></div>
        <div className="space-y-1"><Label>Judul</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Identifikasi Bearing & Kebutuhan Spare Parts" /></div>
        <div className="space-y-1">
          <Label>Jenis</Label>
          <Select value={reportKind} onChange={(e) => setReportKind(e.target.value)}>
            <option value="PEMERIKSAAN">PEMERIKSAAN (daftar part/qty/status)</option>
            <option value="PROGRES">PROGRES (foto sebelum/sesudah)</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Alasan koreksi <span className="text-destructive">*</span></Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Otomatisasi memberi nomor sama dengan ENG-REP-003, seharusnya laporan terpisah tanggal 25 Juli." rows={2} />
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" disabled={pending || !reason.trim() || !number.trim()} onClick={onSave}>{pending ? "Menyimpan..." : "Simpan Koreksi"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

// -------------------------------------------------- generic number dialog
function NumberCorrectionDialog({
  title, currentNumber, onClose, onSave,
}: {
  title: string;
  currentNumber: string;
  onClose: () => void;
  onSave: (newNumber: string, reason: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [number, setNumber] = useState(currentNumber);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit() {
    setPending(true);
    const res = await onSave(number, reason);
    setPending(false);
    if (res.ok) {
      toast({ title: "Nomor dikoreksi", variant: "success" });
      onClose();
      router.refresh();
    } else {
      toast({ title: "Gagal koreksi", description: res.error, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={title} description={`Nomor saat ini: ${currentNumber}`}>
      <div className="space-y-3">
        <div className="space-y-1"><Label>Nomor Baru</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>Alasan koreksi <span className="text-destructive">*</span></Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Otomatisasi membaca nomor yang sama dengan dokumen lain — nomor ini seharusnya urutan berikutnya." rows={2} />
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" disabled={pending || !reason.trim() || !number.trim()} onClick={onSubmit}>{pending ? "Menyimpan..." : "Simpan Koreksi"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Document
function DocumentTab({ folders }: { folders: FolderOpt[] }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [editing, setEditing] = useState<DocRow | null>(null);
  const { toast } = useToast();

  async function runSearch() {
    setLoading(true);
    try {
      const res = await searchDocumentsForCorrection(q);
      setRows(res as unknown as DocRow[]);
      setSearched(true);
    } catch {
      toast({ title: "Gagal mencari dokumen", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Cari nama file... (mis. invoice, R3, athena)" />
        <Button type="button" onClick={runSearch} disabled={loading}>{loading ? "Mencari..." : "Cari"}</Button>
      </div>
      {!searched ? (
        <EmptyState title="Cari nama file" description="Ketik sebagian nama file lalu tekan Cari — daftar dokumen sangat banyak sehingga tidak ditampilkan semua sekaligus." />
      ) : rows.length === 0 ? (
        <EmptyState title="Tidak ditemukan" description="Coba kata kunci lain." />
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Nama File</TableHead><TableHead>Lokasi</TableHead><TableHead>Diunggah</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.originalName}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.folder?.path ?? "-"}</TableCell>
                <TableCell>{new Date(r.uploadedAt).toLocaleDateString("id-ID")}</TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && <DocumentCorrectionDialog row={editing} folders={folders} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DocumentCorrectionDialog({ row, folders, onClose }: { row: DocRow; folders: FolderOpt[]; onClose: () => void }) {
  const [name, setName] = useState(row.originalName);
  const [folderId, setFolderId] = useState(row.folder?.id ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSave() {
    if (!reason.trim()) return;
    setPending(true);
    try {
      if (name.trim() && name.trim() !== row.originalName) {
        const res = await renameDocumentAction(row.id, name.trim(), reason);
        if (!res.ok) throw new Error(res.error);
      }
      if (folderId && folderId !== row.folder?.id) {
        const res = await relocateDocumentAction(row.id, folderId, reason);
        if (!res.ok) throw new Error(res.error);
      }
      toast({ title: "Dokumen dikoreksi", variant: "success" });
      onClose();
      router.refresh();
    } catch (err) {
      toast({ title: "Gagal koreksi", description: err instanceof Error ? err.message : "Terjadi kesalahan.", variant: "destructive" });
    } finally {
      setPending(false);
    }
  }

  const unchanged = name.trim() === row.originalName && folderId === (row.folder?.id ?? "");

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Koreksi Nama & Lokasi Dokumen" description={row.originalName}>
      <div className="space-y-3">
        <div className="space-y-1"><Label>Nama File</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>Pindahkan ke Folder</Label>
          <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">— Tetap di folder saat ini —</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Alasan koreksi <span className="text-destructive">*</span></Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Otomatisasi salah mencocokkan folder pelanggan — dokumen ini seharusnya di proyek Balikpapan, bukan Jakarta." rows={2} />
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" disabled={pending || !reason.trim() || unchanged} onClick={onSave}>{pending ? "Menyimpan..." : "Simpan Koreksi"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------- Opportunity
function OpportunityStageTab({ rows }: { rows: WonLostOpportunity[] }) {
  const { q, setQ, filtered } = useFilter(rows, (r) => `${r.number} ${r.name} ${r.customer?.companyName ?? ""}`);
  const [editing, setEditing] = useState<WonLostOpportunity | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Deal yang sedang berstatus Won/Lost, atau yang sudah dikembalikan ke stage lain tapi masih punya
        quotation/Project sisa dari Won sebelumnya, muncul di sini. Untuk deal yang masih berjalan normal,
        ubah stage-nya langsung dari halaman Opportunity — pemindahan ke Won/Lost sendiri hanya bisa lewat
        tombol &quot;Mark Won&quot;/&quot;Mark Lost&quot; pada quotation-nya, bukan dari sini.
      </p>
      <SearchBox value={q} onChange={setQ} placeholder="Cari nomor deal, nama, atau pelanggan..." />
      {filtered.length === 0 ? (
        <EmptyState title="Tidak ada deal Won/Lost" description="Coba kata kunci lain, atau memang belum ada yang perlu dikoreksi." />
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Deal</TableHead><TableHead>Pelanggan</TableHead><TableHead>Status</TableHead><TableHead>Quotation</TableHead><TableHead>Project</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.number} — {r.name}</TableCell>
                <TableCell>{r.customer?.companyName ?? "-"}</TableCell>
                <TableCell><Badge variant={r.status === "WON" ? "success" : "destructive"}>{r.status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.quotations.length} ({r.quotations.filter((q) => q.status !== "WON" && q.status !== "LOST").length} masih terbuka)</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.projects.length > 0 ? r.projects.map((p) => p.number).join(", ") : "-"}</TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && <OpportunityStageCorrectionDialog row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function OpportunityStageCorrectionDialog({ row, onClose }: { row: WonLostOpportunity; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSave() {
    setPending(true);
    const res = await correctOpportunityStageAction(row.id, reason);
    setPending(false);
    if (res.ok) {
      toast({ title: `${row.number} dikembalikan ke Negotiation`, variant: "success" });
      onClose();
      router.refresh();
    } else {
      toast({ title: "Gagal koreksi", description: res.error, variant: "destructive" });
    }
  }

  async function onArchive() {
    setPending(true);
    const res = await archiveWonArtifactsAction(row.id, reason);
    setPending(false);
    if (res.ok) {
      toast({
        title: `Quotation dikembalikan ke Sent${res.data.archivedProjects.length ? ", Project diarsipkan" : ""}`,
        description: [...res.data.revertedQuotations, ...res.data.archivedProjects].join(", "),
        variant: "success",
      });
      onClose();
      router.refresh();
    } else {
      toast({ title: "Gagal koreksi", description: res.error, variant: "destructive" });
    }
  }

  const openQuotations = row.quotations.filter((q) => q.status !== "WON" && q.status !== "LOST");
  const wonQuotations = row.quotations.filter((q) => q.status === "WON");
  const isCurrentlyDecided = row.status === "WON" || row.status === "LOST";

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Koreksi Status Deal — ${row.number}`}
      description={`${row.name}${row.customer ? ` — ${row.customer.companyName}` : ""}. Status saat ini: ${row.status}.`}
    >
      <div className="space-y-3">
        <div className="space-y-1.5 rounded-md border border-border p-2.5 text-xs">
          <p className="font-medium text-foreground">Quotation ({row.quotations.length}):</p>
          {row.quotations.length === 0 ? (
            <p className="text-muted-foreground">(tidak ada)</p>
          ) : (
            row.quotations.map((qn) => (
              <p key={qn.id} className="text-muted-foreground">
                {formatRevisedNumber(qn.number, qn.revision)} — {qn.status} — {formatCurrency(qn.grandTotal)}
              </p>
            ))
          )}
          <p className="pt-1 font-medium text-foreground">Costing Sheet ({row.costingSheets.length}):</p>
          {row.costingSheets.length === 0 ? (
            <p className="text-muted-foreground">(tidak ada)</p>
          ) : (
            row.costingSheets.map((c) => (
              <p key={c.id} className="text-muted-foreground">
                {formatRevisedNumber(c.number, c.revision)} — {c.status}{c.quotationId ? "" : " (tidak terhubung quotation manapun)"}
              </p>
            ))
          )}
          <p className="pt-1 font-medium text-foreground">Project: {row.projects.length > 0 ? row.projects.map((p) => p.number).join(", ") : "(belum ada)"}</p>
        </div>

        {openQuotations.length > 1 && (
          <p className="rounded bg-warning/10 px-2 py-1.5 text-xs text-muted-foreground">
            Deal ini punya {openQuotations.length} quotation yang sama-sama masih terbuka. Koreksi ini hanya
            mengembalikan stage deal ke Negotiation — penggabungan nomor quotation yang terlanjur ganda perlu
            diputuskan manual (quotation mana yang jadi acuan), lalu revisi berikutnya di-convert lewat
            &quot;Convert to Quotation&quot; -&gt; &quot;Ya, Jadikan Revisi&quot; pada quotation tersebut.
          </p>
        )}
        {wonQuotations.length > 0 && (
          <p className="rounded bg-warning/10 px-2 py-1.5 text-xs text-muted-foreground">
            {wonQuotations.length} quotation ({wonQuotations.map((q) => q.number).join(", ")}) masih berstatus Won
            {row.projects.length > 0 ? `, dengan Project (${row.projects.map((p) => p.number).join(", ")}) yang otomatis terbuat darinya` : ""}.
            Pakai tombol &quot;Arsipkan Project &amp; Kembalikan Quotation&quot; di bawah untuk membereskan ini juga —
            mengembalikan stage deal ke Negotiation saja tidak menyentuh keduanya.
          </p>
        )}

        <div className="space-y-1">
          <Label>Alasan koreksi <span className="text-destructive">*</span></Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="mis. Status ter-set Won lewat stage picker saat masih negosiasi, seharusnya belum ada PO/kontrak."
            rows={3}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          {wonQuotations.length > 0 && (
            <Button type="button" variant="destructive" disabled={pending || !reason.trim()} onClick={onArchive}>
              {pending ? "Menyimpan..." : "Arsipkan Project & Kembalikan Quotation"}
            </Button>
          )}
          {isCurrentlyDecided && (
            <Button type="button" variant="destructive" disabled={pending || !reason.trim()} onClick={onSave}>
              {pending ? "Menyimpan..." : "Kembalikan ke Negotiation"}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// -------------------------------------------------------- Audit Evidence
function AuditEvidenceTab({ data }: { data: MissingEvidence }) {
  const [uploadingPayment, setUploadingPayment] = useState<MissingEvidenceInvoice["payments"][number] | null>(null);
  const [revertingContract, setRevertingContract] = useState<MissingEvidenceContract | null>(null);
  const [revertingMilestone, setRevertingMilestone] = useState<MissingEvidenceMilestone | null>(null);
  const totalFlagged =
    data.invoicesMissingEvidence.length + data.contractsMissingEvidence.length +
    data.milestonesMissingEvidence.length + data.quotationsMissingEvidence.length;

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Record lama yang statusnya bilang &quot;selesai&quot; tapi belum ada file bukti yang sesuai aturan baru
        (PO sebelum Won, bukti transfer sebelum Lunas, dokumen tertandatangan sebelum kontrak Aktif, bukti
        pengiriman sebelum milestone Selesai) — supaya konsisten berlaku untuk data lama, bukan cuma yang baru
        dibuat. {totalFlagged === 0 && "Tidak ada yang perlu ditindaklanjuti saat ini."}
      </p>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Invoice Lunas tanpa bukti transfer ({data.invoicesMissingEvidence.length})</h3>
        <p className="text-xs text-muted-foreground">
          Status TIDAK diubah otomatis di sini — upload bukti transfernya kalau uangnya memang sudah masuk.
          Membalik status ke &quot;belum lunas&quot; sementara nominal yang sudah tercatat tetap ada berisiko
          bikin invoice yang sebenarnya sudah dibayar kelihatan belum dibayar sama sekali.
        </p>
        {data.invoicesMissingEvidence.length === 0 ? (
          <p className="text-xs text-muted-foreground">Semua invoice Lunas/Sebagian sudah ada buktinya.</p>
        ) : (
          <div className="space-y-1.5">
            {data.invoicesMissingEvidence.map((inv) => (
              <div key={inv.id} className="rounded-md border border-border p-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{inv.number} — {inv.customer?.companyName ?? "-"}</p>
                    <p className="text-xs text-muted-foreground">
                      <Badge variant="outline">{inv.status}</Badge> {formatCurrency(inv.paidAmount)} dari {formatCurrency(inv.grandTotal)}
                    </p>
                  </div>
                </div>
                {inv.payments.length === 0 ? (
                  <p className="mt-1 text-xs text-warning">Tidak ada record pembayaran sama sekali untuk invoice ini.</p>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    {inv.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1 text-xs">
                        <span>{p.number} — {formatDate(p.paymentDate)} — {formatCurrency(p.amount)}</span>
                        <Button size="sm" variant="outline" onClick={() => setUploadingPayment(p)}>
                          <Upload className="h-3 w-3" /> Upload Bukti
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Kontrak Aktif tanpa dokumen tertandatangan ({data.contractsMissingEvidence.length})</h3>
        {data.contractsMissingEvidence.length === 0 ? (
          <p className="text-xs text-muted-foreground">Semua kontrak Aktif sudah ada dokumen tertandatangannya.</p>
        ) : (
          <div className="space-y-1.5">
            {data.contractsMissingEvidence.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                <div>
                  <p className="font-medium">{c.number} — {c.customer?.companyName ?? "-"}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(c.contractValue)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setRevertingContract(c)}>Kembalikan ke Draft</Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Milestone pengiriman Selesai tanpa bukti ({data.milestonesMissingEvidence.length})</h3>
        {data.milestonesMissingEvidence.length === 0 ? (
          <p className="text-xs text-muted-foreground">Semua milestone pengiriman yang Selesai sudah ada buktinya.</p>
        ) : (
          <div className="space-y-1.5">
            {data.milestonesMissingEvidence.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.project ? `${m.project.number} — ${m.project.name}` : "-"}{m.dueDate ? ` — ${formatDate(m.dueDate)}` : ""}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setRevertingMilestone(m)}>Kembalikan ke Pending</Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Quotation Won tanpa PO customer ter-upload ({data.quotationsMissingEvidence.length})</h3>
        {data.quotationsMissingEvidence.length === 0 ? (
          <p className="text-xs text-muted-foreground">Semua quotation Won sudah ada file PO-nya.</p>
        ) : (
          <div className="space-y-1.5">
            {data.quotationsMissingEvidence.map((q) => (
              <div key={q.id} className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {formatRevisedNumber(q.number, q.revision)} — {q.customer?.companyName ?? "-"}. Upload PO-nya lewat panel
                  &quot;Customer PO&quot; di halaman Quotation ini, atau kalau memang salah Won, gunakan tab &quot;Status Deal
                  (Won/Lost)&quot; untuk membatalkannya.
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {uploadingPayment && (
        <UploadPaymentEvidenceDialog payment={uploadingPayment} onClose={() => setUploadingPayment(null)} />
      )}
      {revertingContract && (
        <RevertContractDialog contract={revertingContract} onClose={() => setRevertingContract(null)} />
      )}
      {revertingMilestone && (
        <RevertMilestoneDialog milestone={revertingMilestone} onClose={() => setRevertingMilestone(null)} />
      )}
    </div>
  );
}

function UploadPaymentEvidenceDialog({
  payment, onClose,
}: { payment: MissingEvidenceInvoice["payments"][number]; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    const res = await attachPaymentEvidenceAction(payment.id, fd);
    setPending(false);
    if (res.ok) { toast({ title: "Bukti transfer ditambahkan", variant: "success" }); onClose(); router.refresh(); }
    else toast({ title: "Gagal upload", description: res.error, variant: "destructive" });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Upload Bukti Transfer — ${payment.number}`} description={`${formatDate(payment.paymentDate)} — ${formatCurrency(payment.amount)}`}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label>File Bukti Transfer <span className="text-destructive">*</span></Label>
          <Input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={pending}>{pending ? "Mengunggah..." : "Upload"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function RevertContractDialog({ contract, onClose }: { contract: MissingEvidenceContract; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSave() {
    setPending(true);
    const res = await revertContractToDraftAction(contract.id, reason);
    setPending(false);
    if (res.ok) { toast({ title: `${contract.number} dikembalikan ke Draft`, variant: "success" }); onClose(); router.refresh(); }
    else toast({ title: "Gagal koreksi", description: res.error, variant: "destructive" });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Kembalikan ke Draft — ${contract.number}`} description="Belum ada dokumen kontrak tertandatangan yang ter-upload untuk kontrak ini.">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Alasan koreksi <span className="text-destructive">*</span></Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="mis. Kontrak diset Active sebelum aturan wajib upload dokumen tertandatangan berlaku." />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" variant="destructive" disabled={pending || !reason.trim()} onClick={onSave}>{pending ? "Menyimpan..." : "Kembalikan ke Draft"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

function RevertMilestoneDialog({ milestone, onClose }: { milestone: MissingEvidenceMilestone; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSave() {
    if (!milestone.project) return;
    setPending(true);
    const res = await revertMilestoneToPendingAction(milestone.id, milestone.project.number, reason);
    setPending(false);
    if (res.ok) { toast({ title: `Milestone "${milestone.name}" dikembalikan ke Pending`, variant: "success" }); onClose(); router.refresh(); }
    else toast({ title: "Gagal koreksi", description: res.error, variant: "destructive" });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Kembalikan ke Pending — ${milestone.name}`} description="Belum ada bukti pengiriman (surat jalan/BAST) yang ter-upload untuk milestone ini.">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Alasan koreksi <span className="text-destructive">*</span></Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="mis. Milestone ditandai Selesai sebelum aturan wajib upload bukti pengiriman berlaku." />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" variant="destructive" disabled={pending || !reason.trim()} onClick={onSave}>{pending ? "Menyimpan..." : "Kembalikan ke Pending"}</Button>
        </div>
      </div>
    </Dialog>
  );
}
