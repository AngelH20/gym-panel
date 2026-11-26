import type { Metadata } from "next";

// La página es un componente de cliente y no puede exportar metadata.
export const metadata: Metadata = { title: "Ajustes" };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
