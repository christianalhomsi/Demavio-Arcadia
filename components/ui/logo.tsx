"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  href?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
}

const SIZES = {
  xs: { container: "w-6 h-6 sm:w-7 sm:h-7", image: 24, text: "text-xs sm:text-sm" },
  sm: { container: "w-7 h-7 sm:w-8 sm:h-8", image: 28, text: "text-sm sm:text-base" },
  md: { container: "w-9 h-9 sm:w-11 sm:h-11", image: 36, text: "text-base sm:text-lg" },
  lg: { container: "w-14 h-14 sm:w-16 sm:h-16", image: 56, text: "text-lg sm:text-xl" },
  xl: { container: "w-20 h-20 sm:w-24 sm:h-24", image: 80, text: "text-xl sm:text-2xl" },
};

export default function Logo({ href = "/halls", size = "sm", showText = true, className }: LogoProps) {
  const { container, image, text } = SIZES[size];

  const LogoContent = () => (
    <div className={cn("flex items-center gap-1.5 sm:gap-2 group", className)}>
      <div
        className={cn(
          container,
          "rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-105 shrink-0 relative overflow-hidden"
        )}
      >
        <Image
          src="/assets/images/logos/arcadialogo.png"
          alt="Arcadia Gaming Hub Logo"
          width={image * 2}
          height={image * 2}
          className="object-cover w-full h-full rounded-full"
          priority={size === "lg" || size === "xl"}
          quality={100}
          unoptimized
        />
      </div>
      {showText && (
        <span className={cn(text, "font-bold tracking-tight hidden xs:block")}>
          <span style={{ color: "oklch(0.55 0.26 280)" }}>Arc</span>
          <span style={{ color: "oklch(0.82 0.14 200)" }}>adia</span>
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="shrink-0">
        <LogoContent />
      </Link>
    );
  }

  return <LogoContent />;
}
