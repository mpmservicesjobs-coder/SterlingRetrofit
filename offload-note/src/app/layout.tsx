import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";

const head = localFont({ src: "../../assets/fonts/archivo-black-latin-400-normal.woff2", variable: "--font-head", display: "swap" });
const body = localFont({
  src: [
    { path: "../../assets/fonts/inter-latin-400-normal.woff2", weight: "400" },
    { path: "../../assets/fonts/inter-latin-500-normal.woff2", weight: "500" },
    { path: "../../assets/fonts/inter-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Offload notes",
  description: "Waste transfer notes for Offload Waste Removal operatives.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  icons: { icon: "/note/offload-logo.jpg", apple: "/note/offload-logo.jpg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${head.variable} ${body.variable}`}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
