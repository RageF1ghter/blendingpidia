import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nocturne — Cocktail Index',
  description: '暗色编辑部风格的鸡尾酒百科预览。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
