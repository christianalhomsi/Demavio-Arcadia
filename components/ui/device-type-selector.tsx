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
    
    onChange([...value, { device_type_id: selectedType, quantity: 1 }]);
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

  const getTypeName = (typeId: string) => {
    const type = deviceTypes.find(t => t.id === typeId);
    if (!type) return "";
    return locale === "ar" ? type.name_ar : type.name_en;
  };

  const availableTypes = deviceTypes.filter(
    t => !value.some(d => d.device_type_id === t.id)
  );

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <div className="space-y-3">
          {value.map((device) => (
            <div
              key={device.device_type_id}
              className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-muted/20"
            >
              <Monitor size={16} className="text-muted-foreground shrink-0" />
              <div className="flex-1 font-medium text-sm">
                {getTypeName(device.device_type_id)}
              </div>
              <Input
                type="number"
                min={1}
                max={500}
                value={device.quantity}
                onChange={(e) => updateQuantity(device.device_type_id, parseInt(e.target.value) || 0)}
                className="w-24"
              />
              <button
                type="button"
                onClick={() => removeDeviceType(device.device_type_id)}
                className="w-9 h-9 rounded-lg flex items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {availableTypes.length > 0 && (
        <div className="flex gap-2">
          <Select value={selectedType} onValueChange={(v) => setSelectedType(v ?? "")}>
            <SelectTrigger className="flex-1 h-10 w-full">
              <SelectValue placeholder={locale === "ar" ? "اختر نوع الجهاز..." : "Select device type..."} />
            </SelectTrigger>
            <SelectContent>
              {availableTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
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
            className="gap-2"
          >
            <Plus size={14} />
            {locale === "ar" ? "إضافة" : "Add"}
          </Button>
        </div>
      )}

      {value.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          {locale === "ar" ? "لم يتم إضافة أجهزة بعد" : "No devices added yet"}
        </p>
      )}
    </div>
  );
}
