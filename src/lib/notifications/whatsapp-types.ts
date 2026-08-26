// Shared shape between the WhatsApp providers (whatsapp-fonnte.ts,
// whatsapp-cloud.ts) and the router that picks between them
// (whatsapp.ts). Structured rather than one pre-composed string because the
// two providers format it completely differently: Fonnte sends freeform
// text, while the Cloud API fills these same fields into an approved
// message template's placeholders.
export interface SendWhatsAppInput {
  /** International format without "+", e.g. "6281234567890". */
  to: string;
  recipientName: string;
  title: string;
  message: string;
  /** App-relative deep link, e.g. "/finance/invoices/123". */
  link?: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  reason: string;
}
