import { notFound } from "next/navigation";

import { getIncreaseNotice } from "@/lib/dal";
import { buildPlainPdf } from "@/lib/plain-pdf";

export async function GET(
  _request: Request,
  context: { params: Promise<{ tenancyId: string; noticeId: string }> },
) {
  const { tenancyId, noticeId } = await context.params;
  const { notice } = await getIncreaseNotice(noticeId);
  if (notice.tenancyId !== tenancyId) {
    notFound();
  }
  const pdf = buildPlainPdf(notice.lines);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rent-increase-draft-${notice.document.formCode}.pdf"`,
    },
  });
}
