import Image from "next/image";

/** Brand mark from the public/ asset; the artwork is portrait, so it is cropped to a square. */
export function Logo({ size, className }: { size: number; className?: string }) {
  return (
    <Image
      src="/arcadialogo.jpg"
      alt="Arcadia"
      width={size}
      height={size}
      priority
      className={`rounded-xl object-cover object-[50%_42%] ${className ?? ""}`}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`bg-gradient-to-r from-[#8b8cf8] to-accent bg-clip-text font-bold text-transparent ${className ?? ""}`}
    >
      Arcadia
    </span>
  );
}
