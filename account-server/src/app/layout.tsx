import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "RustDesk 账号管理",
  description: "Self-hosted RustDesk account management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
