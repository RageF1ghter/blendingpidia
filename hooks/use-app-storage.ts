'use client';

import { useEffect } from 'react';
import { appStorageChangeEvent } from '@/lib/ingredient-storage';
import { storageKey } from '@/lib/data';

// Subscribes a page to business-data changes: same-tab commits dispatch the
// custom event, cross-tab writes surface through the storage event.
export function useBusinessStorageSync(onChange: () => void) {
  useEffect(() => {
    const storageHandler = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) onChange();
    };
    window.addEventListener(appStorageChangeEvent, onChange);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(appStorageChangeEvent, onChange);
      window.removeEventListener('storage', storageHandler);
    };
  }, [onChange]);
}
