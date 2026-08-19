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
import { Pencil, Search } from "lucide-react";
import { formatCurrency, formatRevisedNumber } from "@/lib/utils";
import {
  correctQuotationNumberAction,
  correctVendorPONumberAction,
  correctInvoiceNumberAction,
  correctProgressReportAction,
  renameDocumentAction,
  relocateDocumentAction,
  searchDocumentsForCorrection,
  correctOpportunityStageAction,
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

interface Props {
  quotations: Quotation[];
  vendorPOs: VendorPO[];
  invoices: Invoice[];
  progressReports: ProgressReport[];
  folders: FolderOpt[];
  wonLostOpportunities: WonLostOpportunity[];
}

const TABS = [
  { value: "quotation", label: "Penawaran" },
  { value: "vendorpo", label: "Pesanan ke Vendor" },
  { value: "invoice", label: "Invoice" },
  { value: "progress", label: "Progress Report" },
  { value: "document", label: "Dokumen (Nama & Lokasi)" },
  { value: "opportunity", label: "Status Deal (Won/Lost)" },
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

export function DocumentCorrectionPanel({ quotations, vendorPOs, invoices, progressReports, folders, wonLostOpportunities }: Props) {
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
        Hanya deal yang sedang berstatus Won/Lost muncul di sini. Untuk deal yang masih berjalan, ubah
        stage-nya langsung dari halaman Opportunity — pemindahan ke Won/Lost sendiri hanya bisa lewat
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

  const openQuotations = row.quotations.filter((q) => q.status !== "WON" && q.status !== "LOST");

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
        {row.projects.length > 0 && (
          <p className="rounded bg-warning/10 px-2 py-1.5 text-xs text-muted-foreground">
            Deal ini sudah punya {row.projects.length} Project yang terlanjur dibuat. Koreksi ini TIDAK
            menghapus/mengarsipkan Project tersebut — kalau memang salah dibuat, itu perlu ditangani terpisah.
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
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" variant="destructive" disabled={pending || !reason.trim()} onClick={onSave}>
            {pending ? "Menyimpan..." : "Kembalikan ke Negotiation"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
