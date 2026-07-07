/**
 * Print CSS for thermal receipts. Sizes the page to 80mm or 58mm and isolates #receipt-print
 * (everything else hidden), so window.print() emits just the receipt at the right paper width.
 * Rendered inline (Next restricts global CSS imports to the root layout).
 */
export function ReceiptPrintStyles({ paper }: { paper: "80" | "58" }) {
  const mm = paper === "58" ? "58mm" : "80mm";
  return (
    <style>{`
      @media print {
        @page { size: ${mm} auto; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        body * { visibility: hidden; }
        #receipt-print, #receipt-print * { visibility: visible; }
        #receipt-print { position: absolute; left: 0; top: 0; width: ${mm}; color: #000; background: #fff; }
      }
    `}</style>
  );
}
