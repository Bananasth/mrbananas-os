import type { ReceiptModel } from "@/server/services/receipt";

export type ReceiptVariant = "online" | "thermal80" | "thermal58";

function money(satang: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(satang / 100);
  } catch {
    return `${(satang / 100).toFixed(2)} ${currency}`;
  }
}

function pickLogo(model: ReceiptModel, variant: ReceiptVariant): string | null {
  const { logoMode, logoColorUrl, logoMonoUrl } = model.seller;
  if (logoMode === "color") return logoColorUrl ?? logoMonoUrl;
  if (logoMode === "mono") return logoMonoUrl ?? logoColorUrl;
  // auto: color online, mono on thermal
  return variant === "online" ? logoColorUrl ?? logoMonoUrl : logoMonoUrl ?? logoColorUrl;
}

/**
 * Shared receipt renderer for online + 80mm/58mm thermal. Pure/presentational (safe in server
 * and client components). Reads a fully-assembled ReceiptModel; theme colors apply on `online`,
 * thermal is monochrome. Root id="receipt-print" so ReceiptPrintStyles can isolate it for print.
 */
export function Receipt({
  model,
  qrSvg,
  variant,
}: {
  model: ReceiptModel;
  qrSvg?: string | null;
  variant: ReceiptVariant;
}) {
  const { seller, invoice, items, totals, payment } = model;
  const cur = seller.currencyCode;
  const loc = seller.locale;
  const fmt = (n: number) => money(n, cur, loc);
  const dt = (iso: string) => new Date(iso).toLocaleString(loc);
  const online = variant === "online";
  const width = variant === "thermal58" ? 219 : variant === "thermal80" ? 302 : undefined;
  const logo = pickLogo(model, variant);

  const style: React.CSSProperties = online
    ? {
        maxWidth: 420,
        color: seller.colors.text ?? "#111827",
        background: seller.colors.background ?? "#ffffff",
      }
    : { width, color: "#000", background: "#fff" };

  const rule = online ? seller.colors.accent ?? "#374e9f" : "#000";
  const title = seller.isVatRegistered
    ? "ใบกำกับภาษีอย่างย่อ · ABB Tax Invoice"
    : "ใบเสร็จรับเงิน · Receipt";

  return (
    <div
      id="receipt-print"
      style={style}
      className={`mx-auto ${online ? "rounded-2xl border border-border p-6" : "p-2"} ${
        online ? "text-sm" : "font-mono text-[11px] leading-tight"
      }`}
    >
      {/* Header */}
      <div className="text-center">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={seller.legalName} className="mx-auto mb-2 h-12 w-auto object-contain" />
        ) : null}
        <div className={online ? "text-base font-bold" : "font-bold"}>{seller.legalName}</div>
        {seller.branchName ? <div>{seller.branchName}</div> : null}
        {seller.address ? <div>{seller.address}</div> : null}
        <div>
          {seller.phone ? <span>โทร {seller.phone}</span> : null}
          {seller.isVatRegistered && seller.taxId ? (
            <span>{seller.phone ? " · " : ""}เลขภาษี {seller.taxId}</span>
          ) : null}
        </div>
        <div>สาขา · Branch {seller.branchCode}</div>
      </div>

      {seller.headerNote ? (
        <p className={`mt-2 text-center ${online ? "text-muted" : ""}`}>{seller.headerNote}</p>
      ) : null}

      <div className="my-2 text-center font-semibold" style={{ borderTop: `1px solid ${rule}`, borderBottom: `1px solid ${rule}`, padding: "2px 0" }}>
        {title}
      </div>

      {/* Meta */}
      <div className="mb-2 space-y-0.5">
        {invoice ? (
          <div className="flex justify-between">
            <span>เลขที่ · No.</span>
            <span>{seller.branchCode}-{invoice.invoiceNo}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span>วันที่ · Date</span>
          <span>{dt(model.datetime)}</span>
        </div>
        <div className="flex justify-between">
          <span>ช่องทาง · Channel</span>
          <span>{model.channel.toUpperCase()}</span>
        </div>
      </div>

      {/* Items */}
      <div style={{ borderTop: `1px dashed ${rule}` }} className="pt-1">
        {items.map((it, i) => (
          <div key={i} className="mb-1">
            <div className="flex justify-between gap-2">
              <span className="truncate">{it.name}</span>
              <span className="tabular-nums">{fmt(it.lineTotal)}</span>
            </div>
            <div className={online ? "text-xs text-muted" : "text-[10px]"}>
              {it.qty} × {fmt(it.unitPrice)}
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{ borderTop: `1px dashed ${rule}` }} className="mt-1 space-y-0.5 pt-1">
        <div className="flex justify-between"><span>ก่อน VAT · Subtotal</span><span className="tabular-nums">{fmt(totals.subtotal)}</span></div>
        <div className="flex justify-between">
          <span>VAT{invoice ? ` ${(invoice.vatRate * 100).toFixed(0)}%` : ""}</span>
          <span className="tabular-nums">{fmt(totals.taxTotal)}</span>
        </div>
        <div className="flex justify-between text-base font-bold" style={{ borderTop: `1px solid ${rule}`, marginTop: 2, paddingTop: 2 }}>
          <span>รวม · Total</span><span className="tabular-nums">{fmt(totals.total)}</span>
        </div>
      </div>

      {/* Payment */}
      {payment ? (
        <div className="mt-1 flex justify-between">
          <span>ชำระโดย · Paid</span>
          <span>{payment.method} · {fmt(payment.amount)}</span>
        </div>
      ) : null}

      {/* Footer */}
      <div className="mt-3 text-center">
        {qrSvg ? <div className="mx-auto mb-1 w-fit" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
        {seller.footerNote ? <p>{seller.footerNote}</p> : <p>ขอบคุณที่ใช้บริการ · Thank you</p>}
        {seller.returnPolicy ? <p className={online ? "mt-1 text-xs text-muted" : "mt-1 text-[10px]"}>{seller.returnPolicy}</p> : null}
        {online && Object.keys(seller.social).length ? (
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 text-xs text-muted">
            {Object.entries(seller.social).map(([k, v]) => (
              <span key={k}>{k}: {v}</span>
            ))}
          </div>
        ) : null}
        {seller.isVatRegistered ? (
          <p className={online ? "mt-1 text-xs text-muted" : "mt-1 text-[10px]"}>ราคารวมภาษีมูลค่าเพิ่มแล้ว · VAT included</p>
        ) : null}
      </div>
    </div>
  );
}
