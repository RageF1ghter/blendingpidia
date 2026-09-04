'use client';

import type { Lang } from '@/lib/i18n';

export function LanguageToggle({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  return (
    <div className="flex shrink-0 items-center rounded-full border border-white/10 bg-white/[0.03] p-0.5 text-xs">
      <button className={`rounded-full px-2.5 py-1 transition ${lang === 'zh' ? 'bg-[#c88955]/20 text-[#e8c197]' : 'text-[#8d9493] hover:text-[#d2d4cc]'}`} onClick={() => onChange('zh')} type="button">中文</button>
      <button className={`rounded-full px-2.5 py-1 transition ${lang === 'en' ? 'bg-[#c88955]/20 text-[#e8c197]' : 'text-[#8d9493] hover:text-[#d2d4cc]'}`} onClick={() => onChange('en')} type="button">EN</button>
    </div>
  );
}
