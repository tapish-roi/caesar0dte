import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTrades } from '@/contexts/TradesContext';

interface Props { open: boolean; onClose: () => void }

export default function ClearAllConfirmModal({ open, onClose }: Props) {
  const { clearTrades, trades } = useTrades();
  const [confirmText, setConfirmText] = useState('');
  const canDelete = confirmText === 'DELETE';

  const handleClear = async () => {
    if (!canDelete) return;
    await clearTrades();
    setConfirmText('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setConfirmText(''); onClose(); } }}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-destructive">מחיקת כל העסקאות</DialogTitle>
          <DialogDescription>
            פעולה זו תעביר {trades.length} עסקאות לפח (ניתן לשחזר תוך 30 ימים).
            הקלד <span className="font-mono font-bold">DELETE</span> כדי לאשר.
          </DialogDescription>
        </DialogHeader>
        <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" dir="ltr" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setConfirmText(''); onClose(); }}>ביטול</Button>
          <Button variant="destructive" disabled={!canDelete} onClick={handleClear}>מחק הכל</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
