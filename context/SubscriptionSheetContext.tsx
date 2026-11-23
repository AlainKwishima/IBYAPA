import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { SubscriptionBottomSheet } from '../components/SubscriptionBottomSheet';
import type { SubscriptionType } from '../services/api/subscriptionTypes';

type OpenOptions = {
  preselectedType?: SubscriptionType;
  onSuccess?: () => void;
};

type SubscriptionSheetContextValue = {
  openSubscriptionSheet: (options?: OpenOptions) => void;
  closeSubscriptionSheet: () => void;
  isSubscriptionSheetVisible: boolean;
};

const SubscriptionSheetContext = createContext<SubscriptionSheetContextValue | null>(null);

export function SubscriptionSheetProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [preselectedType, setPreselectedType] = useState<SubscriptionType | undefined>(undefined);
  const [onSuccessCallback, setOnSuccessCallback] = useState<(() => void) | undefined>(undefined);

  const openSubscriptionSheet = useCallback((options?: OpenOptions) => {
    setPreselectedType(options?.preselectedType);
    setOnSuccessCallback(() => options?.onSuccess);
    setVisible(true);
  }, []);

  const closeSubscriptionSheet = useCallback(() => {
    setVisible(false);
    setPreselectedType(undefined);
    setOnSuccessCallback(undefined);
  }, []);

  const handleSuccess = useCallback(() => {
    if (onSuccessCallback) {
      onSuccessCallback();
    }
    closeSubscriptionSheet();
  }, [closeSubscriptionSheet, onSuccessCallback]);

  const value = useMemo(
    () => ({
      openSubscriptionSheet,
      closeSubscriptionSheet,
      isSubscriptionSheetVisible: visible,
    }),
    [openSubscriptionSheet, closeSubscriptionSheet, visible],
  );

  return (
    <SubscriptionSheetContext.Provider value={value}>
      {children}
      <SubscriptionBottomSheet
        visible={visible}
        onClose={closeSubscriptionSheet}
        preselectedType={preselectedType}
        onSuccess={handleSuccess}
      />
    </SubscriptionSheetContext.Provider>
  );
}

export function useSubscriptionSheet() {
  const ctx = useContext(SubscriptionSheetContext);
  if (!ctx) {
    throw new Error('useSubscriptionSheet must be used within a SubscriptionSheetProvider');
  }
  return ctx;
}
