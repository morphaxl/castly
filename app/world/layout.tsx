import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "World",
  description:
    "Walk around a shared 3D world and type things into existence. Everyone sees what you create.",
};

export default function WorldLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
