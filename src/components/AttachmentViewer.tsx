import { useState } from 'react';
import { Download, FileText, MonitorPlay, ExternalLink, RefreshCw } from 'lucide-react';

interface AttachmentViewerProps {
  url: string;
  name?: string;
}

export default function AttachmentViewer({ url, name }: AttachmentViewerProps) {
  const cleanUrl = url.split('?')[0];
  const ext = (cleanUrl.split('.').pop() ?? '').toLowerCase();
  const displayName = name || 'קובץ מצורף';
  const [iframeKey, setIframeKey] = useState(0);

  const isPdf = ext === 'pdf';
  const isPpt = ext === 'ppt' || ext === 'pptx';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
  const isDoc = ['doc', 'docx'].includes(ext);
  const isOffice = isPpt || isDoc;
  const isViewable = isPdf || isOffice || isImage;

  // Google Docs Viewer (embedded iframe)
  const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  // Microsoft Office Online Viewer — opens reliably in a new tab for PPT/DOC
  const officeOnlineUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;

  // For "open in new tab": PPT/DOC → Office Online Viewer, PDF/image → direct URL
  const openUrl = isOffice ? officeOnlineUrl : url;

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
          {/* Reload iframe (for office files that sometimes fail to load) */}
          {isOffice && (
            <button
              onClick={() => setIframeKey(k => k + 1)}
              title="טען מחדש"
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              טען מחדש
            </button>
          )}
          {/* Open in new tab — office files open in Google Viewer, others open directly */}
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
        </div>
      </div>

      {/* Inline viewer — PDF */}
      {isPdf && (
        <div style={{ height: '540px' }} className="w-full">
          <iframe
            key={iframeKey}
            src={`${url}#toolbar=1&navpanes=0`}
            className="w-full h-full"
            title={displayName}
          />
        </div>
      )}

      {/* Inline viewer — Office files via Google Docs Viewer */}
      {isOffice && (
        <div style={{ height: '560px' }} className="w-full bg-muted/20 relative">
          <iframe
            key={iframeKey}
            src={googleViewerUrl}
            className="w-full h-full"
            title={displayName}
            allow="autoplay"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
          {/* Overlay hint shown when iframe looks blank */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-sm border border-border rounded-lg px-4 py-2 text-xs text-muted-foreground pointer-events-none">
            אם התצוגה לא נטענת — לחץ "טען מחדש" או "פתח בחלון"
          </div>
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
