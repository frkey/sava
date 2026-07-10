/**
 * DESIGN_REFERENCE §8.4 DT3 PDF pane, simplified to a modal per the task brief
 * ("PdfViewer dialog with `<iframe src={objectURL}>`") rather than DT3's inline
 * split-pane layout (PDF left / details right) — documented simplification
 * (`.superpowers/sdd/task-6-report.md`), consistent with already dropping DT3's
 * page-by-page loading progress (divergence B-8 in MOCKUP_DIVERGENCES.md: no
 * streaming API exists, so a plain spinner/iframe stands in for it).
 *
 * Only ever mounted on desktop (≥900px) — FindingDetail.tsx triggers a plain
 * `<a download>` click on mobile instead, per MOCKUP_DIVERGENCES.md C-3.
 *
 * FindingDetail mounts this component only while the dialog is open (mount-on-demand,
 * same pattern Chrome.tsx uses for UserMenu) — so unmount IS close, and revoking the
 * object URL in a cleanup effect covers "on close/unmount" from the task brief without
 * needing a separate close handler for it.
 */
import { useEffect } from 'react';
import { Dialog } from './Dialog';
import { t } from '../strings/pt';

export interface PdfViewerProps {
  title: string;
  fileName: string;
  objectUrl: string;
  onClose(): void;
}

export function PdfViewer({ title, fileName, objectUrl, onClose }: PdfViewerProps) {
  useEffect(() => {
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      className="dialog-panel-wide"
      footer={
        <a className="btn btn-secondary pdf-viewer-download" href={objectUrl} download={fileName}>
          {t.findings.download}
        </a>
      }
    >
      <div className="pdf-viewer-frame-wrap">
        <iframe className="pdf-viewer-iframe" src={objectUrl} title={title} />
      </div>
    </Dialog>
  );
}
