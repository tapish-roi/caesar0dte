import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface MobileBottomNavProps {
  items: NavItem[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export default function MobileBottomNav({ items, activeTab, onTabChange }: MobileBottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex md:hidden h-16 pb-[env(safe-area-inset-bottom)]">
      {items.map(({ key, label, icon: Icon, badge }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {badge != null && badge > 0 && (
                <span className="absolute -top-1.5 -end-2.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-tight">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
