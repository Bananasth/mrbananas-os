import type { QrProduct } from "@/server/services/qr-public";

/** Mr. Banana's brand palette (Phase F customer ordering). */
export const BRAND = { primary: "#374e9f", secondary: "#ffde11", accent: "#ef4238" } as const;

/** Format integer satang as Baht. */
export const baht = (satang: number) => `฿${(satang / 100).toFixed(2)}`;

export type CartItem = {
  key: string;
  productId: string;
  name: string;
  optionIds: string[];
  optionLabel: string;
  unitPrice: number;
  qty: number;
};

export type QrGroup = QrProduct["modifier_groups"][number];
