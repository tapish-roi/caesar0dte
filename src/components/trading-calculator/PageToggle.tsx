import { motion } from 'framer-motion';
import { TrendIcon, CalculatorIcon, CalendarIcon } from '@/components/icons';

export type CalcSection = 'atr' | 'position' | 'calendar';

const SECTIONS: { id: CalcSection; label: string; icon: React.ComponentType<{ className?: string; solid?: boolean }> }[] = [
  { id: 'atr', label: 'מחשבון ATR', icon: TrendIcon },
  { id: 'position', label: 'מחשבון פוזיציה', icon: CalculatorIcon },
  { id: 'calendar', label: 'לוח נתונים כלכליים', icon: CalendarIcon },
];

interface PageToggleProps {
  active: CalcSection;
  onChange: (id: CalcSection) => void;
}

export default function PageToggle({ active, onChange }: PageToggleProps) {
  return (
    // Same rail/pill anatomy as the shared <Tabs> primitive: aurora-tabs trough
    // + aurora-gold active pill (here animated, so the pill is its own layer).
    <div className="inline-flex gap-1 p-1 aurora-tabs rounded-[18px]">
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`relative flex items-center gap-2 px-3 md:px-4 py-2 rounded-[14px] text-sm transition-colors ${
              isActive
                ? 'font-bold text-[var(--au-gold-ink)]'
                : 'font-medium text-muted-foreground hover:text-foreground'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="page-toggle-pill"
                className="absolute inset-0 aurora-gold rounded-[14px]"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {/* the active pill is gold — the gradient stroke would vanish on it */}
              <Icon className="w-4 h-4" solid={isActive} />
              {s.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
