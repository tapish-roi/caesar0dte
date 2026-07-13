import { TrendingUp, Settings, ChevronDown } from 'lucide-react';
import { useLiquidGlass } from '@/hooks/use-liquid-glass';

interface MobileHeaderProps {
  title?: string;
  subtitle?: string;
  onSettingsClick?: () => void;
  onTitleClick?: () => void;
  showChevron?: boolean;
}

export default function MobileHeader({ title, subtitle, onSettingsClick, onTitleClick, showChevron }: MobileHeaderProps) {
  const glassRef = useLiquidGlass<HTMLElement>();
  return (
    <header ref={glassRef} className="flex md:hidden items-center gap-3 px-4 py-3 border-b border-[var(--lg-border)] liquid-glass-sidebar sticky top-0 z-30">
      <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
        <TrendingUp className="w-4 h-4 text-primary-foreground" />
      </div>
      <div className="flex-1 min-w-0" onClick={onTitleClick}>
        <div className="flex items-center gap-1 cursor-pointer">
          <span className="text-sm font-bold text-foreground truncate"><span className="text-sm font-bold text-foreground truncate">{title || 'Caesar 0 DTE'}</span></span>
          {showChevron && <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        </div>
        {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
      </div>
      {onSettingsClick && (
        <button onClick={onSettingsClick} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors shrink-0">
          <Settings className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
    </header>
  );
}
