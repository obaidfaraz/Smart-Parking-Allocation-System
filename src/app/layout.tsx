import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parkwise | Smart Parking Operations",
  description:
    "Manage parking areas, drivers, vehicles and live parking allocations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
