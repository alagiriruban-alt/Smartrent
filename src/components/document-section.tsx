import Link from "next/link";

import { deleteDocumentAction } from "@/actions/documents";
import { DeleteForm } from "@/components/delete-form";
import { DocumentUploadForm } from "@/components/document-upload-form";
import { card, secondaryButton } from "@/components/styles";
import { STORAGE_NOT_CONFIGURED } from "@/lib/documents/catalog";
import { formatLongDate } from "@/lib/dates";
import type {
  DocumentAuditView,
  DocumentView,
  UploadTarget,
} from "@/lib/services/documents";
import type { StorageMode } from "@/lib/documents/storage";

function expiryText(document: DocumentView): string | null {
  if (!document.expiresOn) {
    return null;
  }
  const date = formatLongDate(document.expiresOn);
  if (document.expiry === "expired") {
    return `Expired ${date}`;
  }
  if (document.expiry === "soon") {
    return `Expires ${date}`;
  }
  return `Expires ${date}`;
}

export function DocumentSection({
  heading = "Documents",
  documents,
  targets,
  storageMode,
  expiring,
  audit,
  showIndexLink = false,
}: {
  heading?: string;
  documents: DocumentView[];
  targets: UploadTarget[];
  storageMode: StorageMode;
  expiring?: DocumentView[];
  audit?: DocumentAuditView[];
  showIndexLink?: boolean;
}) {
  const configured = storageMode !== "unconfigured";

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-serif text-2xl">{heading}</h2>
        {showIndexLink ? (
          <Link href="/dashboard/documents" className="text-sm font-semibold text-pine">
            All documents
          </Link>
        ) : null}
      </div>

      {expiring ? (
        <div className="mt-4">
          <h3 className="font-serif text-xl">Upcoming expiry</h3>
          <p className="mt-1 text-sm text-muted">
            Dates in the next 60 days, and dates that have already passed.
          </p>
          {expiring.length === 0 ? (
            <p className={`${card} mt-3 p-4 text-muted`}>Nothing expires in the next 60 days.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {expiring.map((document) => (
                <li key={document.id} className={`${card} px-4 py-3 text-sm`}>
                  <span className="font-semibold">{document.fileName}</span>
                  <span className="text-muted">
                    {" "}
                    · {document.kindLabel} · {document.attachedTo}
                  </span>
                  <span className={document.expiry === "expired" ? "mt-1 block text-danger" : "mt-1 block"}>
                    {expiryText(document)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {configured ? (
        <DocumentUploadForm targets={targets} />
      ) : (
        <p className={`${card} mt-4 p-4`} role="status">
          {STORAGE_NOT_CONFIGURED}
        </p>
      )}
      {storageMode === "local" ? (
        <p className="mt-2 text-sm text-muted">Files are stored on this computer.</p>
      ) : null}

      {documents.length === 0 ? (
        <p className={`${card} mt-4 p-4 text-muted`}>No documents yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {documents.map((document) => {
            const when = expiryText(document);
            return (
              <li key={document.id} className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{document.fileName}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {document.kindLabel} · {document.subjectLabel} · {document.attachedTo}
                    </p>
                    <p className="text-sm text-muted">
                      {document.byteLabel} · Added {formatLongDate(document.createdOn)}
                    </p>
                    {when ? (
                      <p className={document.expiry === "expired" ? "text-sm text-danger" : "text-sm"}>
                        {when}
                      </p>
                    ) : null}
                  </div>
                  {configured ? (
                    <a
                      href={`/dashboard/documents/${document.id}/file`}
                      className={secondaryButton}
                    >
                      Download
                    </a>
                  ) : null}
                </div>
                <div className="mt-4 border-t border-line pt-4">
                  <DeleteForm
                    action={deleteDocumentAction}
                    id={document.id}
                    label="Delete file"
                    confirm="I understand this deletes the file."
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {audit ? (
        <div className="mt-8">
          <h3 className="font-serif text-xl">Activity</h3>
          {audit.length === 0 ? (
            <p className={`${card} mt-3 p-4 text-muted`}>No uploads or deletions yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {audit.map((entry) => (
                <li key={entry.id} className={`${card} px-4 py-3`}>
                  <p>{entry.summary}</p>
                  <p className="text-muted">
                    {new Intl.DateTimeFormat("en-CA", {
                      timeZone: "America/Toronto",
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(entry.createdAt))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
