import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BlendingPidia — Cocktail Encyclopedia',
  description: '可搜索、可按库存筛选、支持版本改编的鸡尾酒百科。 Searchable cocktail encyclopedia with stock filters and recipe variations.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
