import "server-only";

import { notFound } from "next/navigation";

import { requireUser } from "@/lib/dal";
import type { ReceiptView } from "@/lib/receipt";
import {
  getPaymentRecordFor,
  getReceiptFor,
  getReminderBoardFor,
  getRentOverviewFor,
  getTenancyLedgerFor,
  listPayableTenanciesFor,
  type LateTenant,
  type ReminderCard,
  type RentTenancyRow,
  type TenancyLedger,
} from "@/lib/services/rent";

export type { LateTenant, ReminderCard, RentTenancyRow, TenancyLedger };

export async function getRentOverview() {
  const user = await requireUser();
  const overview = await getRentOverviewFor(user.id);
  return { user, ...overview };
}

export async function getTenancyLedger(tenancyId: string): Promise<TenancyLedger> {
  const user = await requireUser();
  const ledger = await getTenancyLedgerFor(user.id, tenancyId);
  if (!ledger) {
    notFound();
  }
  return ledger;
}

export async function listPayableTenancies() {
  const user = await requireUser();
  return listPayableTenanciesFor(user.id);
}

export async function getPaymentRecord(paymentId: string) {
  const user = await requireUser();
  const payment = await getPaymentRecordFor(user.id, paymentId);
  if (!payment) {
    notFound();
  }
  return payment;
}

export async function getReceipt(paymentId: string): Promise<ReceiptView> {
  const user = await requireUser();
  const receipt = await getReceiptFor(user.id, paymentId);
  if (!receipt) {
    notFound();
  }
  return receipt;
}

export async function getReminderBoard() {
  const user = await requireUser();
  return getReminderBoardFor(user.id);
}
