import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import "@/styles/globals.css";

const headingFont = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const bodyFont = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Terra",
  description: "A personal finance journal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${headingFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="font-terra-body min-h-full flex flex-col"><QueryProvider>{children}</QueryProvider></body>
    </html>
  );
}
