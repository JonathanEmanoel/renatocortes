import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Renato Cortes Barbearia",
  description: "Seu estilo, nossa arte.",
  icons: {
    icon: "/brand/favicon-renato-cortes.png",
    shortcut: "/brand/favicon-renato-cortes.png",
    apple: "/brand/favicon-renato-cortes.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
