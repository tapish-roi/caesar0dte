import React, { createContext, useContext, useState, useCallback } from 'react';

interface TransitionContextType {
  isTransitioning: boolean;
  startTransition: () => void;
  endTransition: () => void;
}

const TransitionContext = createContext<TransitionContextType>({
  isTransitioning: false,
  startTransition: () => {},
  endTransition: () => {},
});

export const TransitionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isTransitioning, setIsTransitioning] = useState(false);

  const startTransition = useCallback(() => setIsTransitioning(true), []);
  const endTransition = useCallback(() => setIsTransitioning(false), []);

  return (
    <TransitionContext.Provider value={{ isTransitioning, startTransition, endTransition }}>
      {children}
    </TransitionContext.Provider>
  );
};

export const useTransition = () => useContext(TransitionContext);
