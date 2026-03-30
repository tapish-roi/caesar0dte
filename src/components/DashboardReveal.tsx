import { motion } from 'framer-motion';
import { useTransition } from '@/contexts/TransitionContext';
import { useEffect, useState } from 'react';

const premiumEase = [0.22, 1, 0.36, 1] as const;

export default function DashboardReveal({ children }: { children: React.ReactNode }) {
  const { isTransitioning, endTransition } = useTransition();
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (isTransitioning) {
      // Small delay so the auth exit animation runs first
      const timer = setTimeout(() => {
        setShouldAnimate(true);
        endTransition();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isTransitioning, endTransition]);

  // If not coming from auth transition, just render normally
  if (!shouldAnimate && !isTransitioning) {
    return <>{children}</>;
  }

  // While waiting for auth exit to finish, show nothing
  if (isTransitioning && !shouldAnimate) {
    return (
      <div className="min-h-screen bg-background" />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: premiumEase }}
      onAnimationComplete={() => setShouldAnimate(false)}
    >
      {children}
    </motion.div>
  );
}
