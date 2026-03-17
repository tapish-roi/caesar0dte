import { Download, FileText, MonitorPlay } from 'lucide-react';

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
  const isViewable = isPdf || isPpt || isImage || isDoc;

  // Google Docs Viewer for PPT/PPTX/DOC/DOCX
  const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

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
          {/* Download button — always visible */}
          <a
            href={url}
            download={displayName}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all"
            onClick={e => e.stopPropagation()}
          >
            <Download className="w-3.5 h-3.5" />
            הורד
          </a>
          {/* Open in new tab */}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:opacity-80 transition-opacity"
          >
            פתח בחלון ↗
          </a>
        </div>
      </div>

      {/* Inline viewer */}
      {isPdf && (
        <div style={{ height: '540px' }} className="w-full">
          <iframe
            src={`${url}#toolbar=1&navpanes=0`}
            className="w-full h-full"
            title={displayName}
          />
        </div>
      )}

      {(isPpt || isDoc) && (
        <div style={{ height: '540px' }} className="w-full bg-muted/20">
          <iframe
            src={googleViewerUrl}
            className="w-full h-full"
            title={displayName}
            allow="autoplay"
          />
        </div>
      )}

      {isImage && (
        <div className="px-6 pb-6 pt-2">
          <img
            src={url}
            alt={displayName}
            className="w-full max-h-[520px] object-contain rounded-lg border border-border bg-muted/30"
          />
        </div>
      )}

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
