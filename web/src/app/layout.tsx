import type { Metadata, Viewport } from "next";
// All fonts are served from the project itself (npm packages), so none depends on Google Fonts at runtime.
import "@fontsource-variable/cairo/index.css";
import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import "./globals.css";
import { SELECT_CSS } from "./select-styles";

export const metadata: Metadata = {
  title: { default: "Gaming Hall Dashboard", template: "%s · Gaming Hall Dashboard" },
  description: "Management dashboard for gaming hall operators",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Android Chrome: the keyboard shrinks the layout viewport so bottom-anchored UI moves up with it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <style dangerouslySetInnerHTML={{ __html: SELECT_CSS }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
