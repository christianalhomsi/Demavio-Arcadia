"use client";

import React, { useState, useEffect, useRef } from "react";
import Calendar from "react-calendar";
import { Button } from "./button";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { useLocale } from "next-intl";

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

interface DatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  className?: string;
}

export function DatePicker({ value, onChange, className }: DatePickerProps) {
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleDateChange = (newValue: Value) => {
    if (newValue && !Array.isArray(newValue)) {
      onChange(newValue);
      setIsOpen(false);
    }
  };

  const updatePosition = () => {
    if (!buttonRef.current || isMobile) return;
    const rect = buttonRef.current.getBoundingClientRect();
    let left = rect.left + window.scrollX;
    if (left + 320 > window.innerWidth) left = window.innerWidth - 340;
    setPosition({
      top: rect.bottom + window.scrollY + 8,
      left: Math.max(20, left),
    });
  };

  useEffect(() => {
    if (isOpen && !isMobile) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, isMobile]);

  return (
    <>
      <div className={cn("relative", className)}>
        <Button
          ref={buttonRef}
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full justify-start text-right font-bold h-11 rounded-xl border-border/60 bg-background/80 backdrop-blur-sm hover:border-primary/50 transition-all duration-200"
          dir={locale === "ar" ? "rtl" : "ltr"}
        >
          <CalendarDays size={18} className={locale === "ar" ? "ml-2" : "mr-2"} style={{ color: "oklch(0.65 0.22 280)" }} />
          <span className="truncate">
            {value ? value.toLocaleDateString(locale === "ar" ? "ar-SY" : "en-US", { year: "numeric", month: "long", day: "numeric" }) : "Select Date"}
          </span>
        </Button>
      </div>

      {isOpen && typeof window !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-[2px]" onClick={() => setIsOpen(false)} />
          <div 
            className={cn("fixed z-[9999] duration-200 animate-in fade-in zoom-in-95", isMobile ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-[340px]" : "")}
            style={!isMobile ? { top: `${position.top}px`, left: `${position.left}px` } : undefined}
          >
            <div className="rounded-2xl border shadow-2xl overflow-hidden relative p-2" dir={locale === "ar" ? "rtl" : "ltr"} style={{ background: 'oklch(0.14 0.014 265)', borderColor: 'oklch(0.24 0.016 265)' }}>
              {isMobile && (
                <button onClick={() => setIsOpen(false)} className="absolute top-2 left-2 p-1.5 rounded-full bg-white/5 text-muted-foreground z-10"><X size={16} /></button>
              )}
              <Calendar
                onChange={handleDateChange}
                value={value}
                locale={locale}
                nextLabel={locale === "ar" ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                prevLabel={locale === "ar" ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                next2Label={null} prev2Label={null}
                formatShortWeekday={(l, date) => (locale === "ar" ? ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'][date.getDay()] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()])}
                className="custom-calendar"
              />
            </div>
          </div>
          <style jsx global>{`
            .custom-calendar { width: 100% !important; background: transparent !important; border: none !important; color: white !important; }
            .react-calendar__navigation { display: flex; height: 44px; margin-bottom: 10px; }
            .react-calendar__navigation button { color: white; font-weight: bold; font-size: 16px; min-width: 44px; background: none; border: none; }
            .react-calendar__month-view__weekdays { color: oklch(0.65 0.22 280); font-weight: bold; text-align: center; font-size: 12px; padding-bottom: 10px; }
            .react-calendar__month-view__days__day { color: white !important; padding: 10px !important; font-weight: 500; }
            .react-calendar__tile--now { background: rgba(255,255,255,0.05) !important; border-radius: 10px; }
            .react-calendar__tile--active { background: oklch(0.55 0.26 280) !important; border-radius: 10px; color: white !important; }
            .react-calendar__tile:enabled:hover { background: rgba(255,255,255,0.1) !important; border-radius: 10px; }
            .react-calendar__month-view__days__day--neighboringMonth { opacity: 0.2; }
          `}</style>
        </>,
        document.body
      )}
    </>
  );
}
