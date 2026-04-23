import { type LucideIcon, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  disabled?: boolean;
}

interface MobileBottomNavProps {
  items: NavItem[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export default function MobileBottomNav({ items, activeTab, onTabChange }: MobileBottomNavProps) {
  const { toast } = useToast();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--glass-border)] backdrop-blur-md flex md:hidden h-16 pb-[env(safe-area-inset-bottom)]" style={{ background: 'var(--glass-bg)' }}>
      {items.map(({ key, label, icon: Icon, badge, disabled }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            onClick={() => {
              if (disabled) {
                toast({ title: 'בקרוב', description: 'פיצ׳ר הלייב יהיה זמין בקרוב' });
                return;
              }
              onTabChange(key);
            }}
            className={cn(
              'mobile-nav-tab sidebar-tab-glow flex-1 flex flex-col items-center justify-center gap-0.5 pt-1',
              disabled
                ? 'is-disabled text-muted-foreground/30'
                : isActive
                  ? 'is-active text-primary'
                  : 'text-muted-foreground'
            )}
          >
            <div className="mobile-nav-icon-wrap relative">
              {disabled ? <Lock className="w-4 h-4" /> : <Icon className="w-5 h-5" />}
              {badge != null && badge > 0 && (
                <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center shadow-[0_0_8px_hsl(var(--primary)/0.6)]">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </div>
            <span className="sidebar-tab-label text-[9px] font-medium leading-tight truncate max-w-full px-0.5">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
