import Link from "next/link";
import type { Hall } from "@/types/hall";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function HallCard({ hall }: { hall: Hall }) {
  return (
    <Card className="group flex flex-col border-border/60 hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="flex-1 pt-5">
        {/* icon + name */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
            style={{ background: "oklch(0.55 0.26 280 / 0.12)", border: "1px solid oklch(0.55 0.26 280 / 0.2)" }}>
            🏟
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{hall.name}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {hall.address ?? "No address provided"}
            </p>
          </div>
        </div>

        <Badge variant="secondary" className="text-xs">
          Active
        </Badge>
      </CardContent>

      <CardFooter className="pt-0 pb-4">
        <Link href={`/halls/${hall.id}`}
          className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
            View devices
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
      </CardFooter>
    </Card>
  );
}
