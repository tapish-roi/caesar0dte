import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { X } from 'lucide-react';

interface MediaLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  type: 'video' | 'image';
}

export default function MediaLightbox({ open, onOpenChange, url, type }: MediaLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none overflow-hidden [&>button]:hidden">
        <DialogTitle className="sr-only">תצוגת מדיה</DialogTitle>
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        {type === 'video' ? (
          <video src={url} className="w-full max-h-[85vh] rounded-xl" controls autoPlay controlsList="nodownload" onContextMenu={e => e.preventDefault()} />
        ) : (
          <img src={url} alt="" className="w-full max-h-[85vh] object-contain rounded-xl" />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function useMediaLightbox() {
  const [lightbox, setLightbox] = useState<{ url: string; type: 'video' | 'image' } | null>(null);
  return {
    lightbox,
    openLightbox: (url: string, type: 'video' | 'image') => setLightbox({ url, type }),
    closeLightbox: () => setLightbox(null),
  };
}
