// Trigger for the students-tab tutorial. Kept in its own module so the
// tutorial itself (the scene choreography, ~35 kB of code) is lazily imported
// and only reaches the browser when a mentor actually opens it.
import { lazy, Suspense, useState } from 'react';
import { PlayIcon } from '@/components/icons';

const StudentsTabTutorial = lazy(() => import('@/components/StudentsTabTutorial'));

export default function StudentsTabTutorialButton({ className = '' }: { className?: string }) {
  // `mounted` stays true after the first open so the chunk is fetched once and
  // the dialog keeps its exit animation on close.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => { setMounted(true); setOpen(true); }}
        className={`h-9 px-3.5 shrink-0 rounded-lg bg-primary/10 ring-1 ring-primary/30 text-primary text-sm font-medium flex items-center gap-2 hover:bg-primary/20 transition-all ${className}`}
        title="מדריך מונפש קצר על טאב התלמידים"
      >
        <PlayIcon className="w-3.5 h-3.5 rotate-180" />
        צפה במדריך
      </button>
      {mounted && (
        <Suspense fallback={null}>
          <StudentsTabTutorial open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
