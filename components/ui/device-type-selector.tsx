"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Monitor } from "lucide-react";
import type { DeviceType } from "@/types/device-type";

type DeviceSelection = {
  device_type_id: string;
  quantity: number;
  price_per_hour: number;
};

type Props = {
  deviceTypes: DeviceType[];
  value: DeviceSelection[];
  onChange: (value: DeviceSelection[]) => void;
  locale: string;
};

export default function DeviceTypeSelector({ deviceTypes, value, onChange, locale }: Props) {
  const [selectedType, setSelectedType] = useState("");

  const addDeviceType = () => {
    if (!selectedType) return;
    if (value.some(d => d.device_type_id === selectedType)) return;
    
    onChange([...value, { device_type_id: selectedType, quantity: 1, price_per_hour: 0 }]);
    setSelectedType("");
  };

  const removeDeviceType = (typeId: string) => {
    onChange(value.filter(d => d.device_type_id !== typeId));
  };

  const updateQuantity = (typeId: string, quantity: number) => {
    onChange(value.map(d => 
      d.device_type_id === typeId ? { ...d, quantity: Math.max(0, quantity) } : d
    ));
  };

  const updatePrice = (typeId: string, price: number) => {
    onChange(value.map(d => 
      d.device_type_id === typeId ? { ...d, price_per_hour: Math.max(0, price) } : d
    ));
  };

  const getTypeName = (typeId: string) => {
    const type = deviceTypes.find(t => t.id === typeId);
    if (!type) return "";
    return locale === "ar" ? type.name_ar : type.name_en;
  };

  const availableTypes = deviceTypes.filter(
    t => !value.some(d => d.device_type_id === t.id)
  );

  const selectedTypeName = selectedType ? getTypeName(selectedType) : "";

  return (
    <div className="space-y-3 md:space-y-4">
      {value.length > 0 && (
        <div className="space-y-2 md:space-y-3">
          {value.map((device) => (
            <div
              key={device.device_type_id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-3 p-3 md:p-4 rounded-lg md:rounded-xl border border-border/40 bg-muted/20"
            >
              <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                <Monitor size={14} className="md:w-4 md:h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 font-medium text-xs md:text-sm truncate">
                  {getTypeName(device.device_type_id)}
                </div>
              </div>
              <div className="flex items-center gap-2 justify-between sm:justify-start">
                <div className="space-y-1 flex-1 sm:flex-none">
                  <Label className="text-[11px] md:text-xs text-muted-foreground">{locale === "ar" ? "الكمية" : "Qty"}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={device.quantity}
                    onChange={(e) => updateQuantity(device.device_type_id, parseInt(e.target.value) || 0)}
                    className="w-full sm:w-16 md:w-20 h-9 md:h-10 text-sm"
                  />
                </div>
                <div className="space-y-1 flex-1 sm:flex-none">
                  <Label className="text-[11px] md:text-xs text-muted-foreground">{locale === "ar" ? "السعر/ساعة" : "Price/hr"}</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={device.price_per_hour}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      updatePrice(device.device_type_id, parseFloat(val) || 0);
                    }}
                    placeholder="0.00"
                    className="w-full sm:w-20 md:w-24 h-9 md:h-10 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeDeviceType(device.device_type_id)}
                  className="w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors shrink-0 self-end sm:self-auto"
                >
                  <Trash2 size={13} className="md:w-[14px] md:h-[14px]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {availableTypes.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selectedType} onValueChange={(v) => setSelectedType(v ?? "")}>
            <SelectTrigger className="flex-1 h-9 md:h-10 w-full text-sm md:text-base">
              <SelectValue>
                {selectedTypeName || (locale === "ar" ? "اختر نوع الجهاز..." : "Select device type...")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availableTypes.map((type) => (
                <SelectItem key={type.id} value={type.id} className="text-sm md:text-base">
                  {locale === "ar" ? type.name_ar : type.name_en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={addDeviceType}
            disabled={!selectedType}
            variant="outline"
            className="gap-1.5 md:gap-2 h-9 md:h-10 text-sm md:text-base w-full sm:w-auto"
          >
            <Plus size={13} className="md:w-[14px] md:h-[14px]" />
            {locale === "ar" ? "إضافة" : "Add"}
          </Button>
        </div>
      )}

      {value.length === 0 && (
        <p className="text-[11px] md:text-xs text-muted-foreground text-center py-3 md:py-4">
          {locale === "ar" ? "لم يتم إضافة أجهزة بعد" : "No devices added yet"}
        </p>
      )}
    </div>
  );
}
