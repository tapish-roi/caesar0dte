import { motion } from 'framer-motion';
import { TrendingUp, Calculator, CalendarRange } from 'lucide-react';

export type CalcSection = 'atr' | 'position' | 'calendar';

const SECTIONS: { id: CalcSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'atr', label: 'מחשבון ATR', icon: TrendingUp },
  { id: 'position', label: 'מחשבון פוזיציה', icon: Calculator },
  { id: 'calendar', label: 'לוח נתונים כלכליים', icon: CalendarRange },
];

interface PageToggleProps {
  active: CalcSection;
  onChange: (id: CalcSection) => void;
}

export default function PageToggle({ active, onChange }: PageToggleProps) {
  return (
    <div className="inline-flex gap-1 p-1 bg-muted/40 rounded-xl border border-border">
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`relative flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="page-toggle-pill"
                className="absolute inset-0 bg-primary rounded-lg"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              <Icon className="w-4 h-4" />
              {s.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
