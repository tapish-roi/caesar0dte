import { FileText, MonitorPlay, ExternalLink } from 'lucide-react';

interface AttachmentViewerProps {
  url: string;
  name?: string;
}

export default function AttachmentViewer({ url, name }: AttachmentViewerProps) {
  const cleanUrl = url.split('?')[0];
  const ext = (cleanUrl.split('.').pop() ?? '').toLowerCase();
  const displayName = name || 'קובץ מצורף';

  const isPdf = ext === 'pdf';
  const isPpt = ext === 'ppt' || ext === 'pptx';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
  const isDoc = ['doc', 'docx'].includes(ext);
  const isDocument = isPdf || isPpt || isDoc;
  const isViewable = isDocument || isImage;

  // Google Docs Viewer for inline preview of all document types
  const googleViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

  // "Open in new tab" uses Google Docs Viewer for documents
  const openUrl = isDocument ? googleViewerUrl : url;

  return (
    <div className="border-t border-border">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-primary/5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {isPpt ? (
            <MonitorPlay className="w-4 h-4 text-primary" />
          ) : (
            <FileText className="w-4 h-4 text-primary" />
          )}
          <span>{displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            פתח בחלון
          </a>
        </div>
      </div>

      {/* Inline viewer — PDF / PPT / DOC via Google Docs Viewer */}
      {isDocument && (
        <div style={{ height: '540px' }} className="w-full">
          <iframe
            src={googleViewerUrl}
            className="w-full h-full border-none"
            title={displayName}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}

      {/* Inline viewer — Images */}
      {isImage && (
        <div className="px-6 pb-6 pt-2">
          <img
            src={url}
            alt={displayName}
            className="w-full max-h-[520px] object-contain rounded-lg border border-border bg-muted/30"
          />
        </div>
      )}

      {/* Fallback for unsupported types */}
      {!isViewable && (
        <div className="px-6 pb-5 pt-2 flex items-center gap-3 bg-muted/20">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground">לחץ הורד כדי לפתוח את הקובץ</p>
          </div>
        </div>
      )}
    </div>
  );
}
