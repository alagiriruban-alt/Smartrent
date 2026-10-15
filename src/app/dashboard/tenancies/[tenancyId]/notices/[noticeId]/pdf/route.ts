import { notFound } from "next/navigation";

import { getIncreaseNotice, requireUser } from "@/lib/dal";
import { buildTextPdf } from "@/lib/n4/pdf";
import { buildPlainPdf } from "@/lib/plain-pdf";
import { getN4Notice } from "@/lib/services/n4";

export async function GET(
  _request: Request,
  context: { params: Promise<{ tenancyId: string; noticeId: string }> },
) {
  const { tenancyId, noticeId } = await context.params;
  const user = await requireUser();
  const n4 = await getN4Notice(user.id, noticeId);
  if (n4) {
    if (n4.tenancyId !== tenancyId) {
      notFound();
    }
    const pdf = buildTextPdf(n4.lines);
    const filename = n4.confirmedAt ? "n4-notice.pdf" : "n4-notice-draft.pdf";
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  }
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
