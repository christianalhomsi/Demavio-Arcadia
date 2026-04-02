import type { Metadata } from "next";
import ReactQueryProvider from "@/lib/query/provider";

export const metadata: Metadata = {
  title: "Gaming Hub",
  description: "Gaming Hub",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ReactQueryProvider>{children}</ReactQueryProvider>
      </body>
    </html>
  );
}
