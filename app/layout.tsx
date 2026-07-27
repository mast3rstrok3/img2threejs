import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "image2threejs — Interactive Asset Gallery",
  description:
    "Explore procedural Three.js assets in the browser. Orbit, zoom, inspect, and explode each reconstruction.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07080d",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
