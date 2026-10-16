import { DocumentSection } from "@/components/document-section";
import { requireUser } from "@/lib/dal";
import { EXPIRY_WINDOW_DAYS } from "@/lib/documents/catalog";
import { loadDocumentPanel } from "@/lib/services/documents";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const user = await requireUser();
  const panel = await loadDocumentPanel(user.id, { type: "portfolio" });

  return (
    <div>
      <h1 className="font-serif text-4xl tracking-tight">Documents</h1>
      <p className="mt-2 max-w-xl text-muted">
        Keep leases, ID, insurance, inspections, notices, and receipts with the
        property, unit, tenant, or lease they belong to. Dates in the next{" "}
        {EXPIRY_WINDOW_DAYS} days show up under upcoming expiry.
      </p>
      <DocumentSection
        heading="Files"
        documents={panel.documents}
        targets={panel.targets}
        storageMode={panel.storageMode}
        expiring={panel.expiring}
        audit={panel.audit}
      />
    </div>
  );
}
