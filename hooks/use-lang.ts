'use client';

import { useEffect, useState } from 'react';
import { langStorageKey, type Lang } from '@/lib/i18n';

export function useLang() {
  const [lang, setLang] = useState<Lang>('zh');

  useEffect(() => {
    const saved = localStorage.getItem(langStorageKey);
    if (saved === 'zh' || saved === 'en') setLang(saved);
    else setLang(navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en');
  }, []);

  useEffect(() => {
    localStorage.setItem(langStorageKey, lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  return [lang, setLang] as const;
}
