import { buildReceiptPdf, receiptLines } from "@/lib/receipt";
import { getReceipt } from "@/lib/rent-data";

export async function GET(
  _request: Request,
  context: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await context.params;
  const receipt = await getReceipt(paymentId);
  const pdf = buildReceiptPdf(receiptLines(receipt));
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rent-receipt-${receipt.receiptNumber}.pdf"`,
    },
  });
}
