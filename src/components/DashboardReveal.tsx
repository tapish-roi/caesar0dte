import { motion } from 'framer-motion';

const premiumEase = [0.22, 1, 0.36, 1] as const;

export default function DashboardReveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      layoutId="main-container"
      className="min-h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        layout: { duration: 0.7, ease: premiumEase },
        opacity: { duration: 0.4, delay: 0.2, ease: premiumEase },
      }}
      style={{ borderRadius: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.35, ease: premiumEase }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
