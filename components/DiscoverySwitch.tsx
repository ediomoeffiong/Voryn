"use client";

import { Globe2, MapPin, MonitorPlay } from "lucide-react";
import { DiscoveryMode } from "@/lib/domain";

const modes: { value: DiscoveryMode; label: string; icon: React.ElementType }[] = [
  { value: "local", label: "Local", icon: MapPin },
  { value: "online", label: "Online", icon: MonitorPlay },
  { value: "global", label: "Global", icon: Globe2 }
];

type Props = {
  active: DiscoveryMode;
  onChange: (mode: DiscoveryMode) => void;
};

export function DiscoverySwitch({ active, onChange }: Props) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Discovery mode">
      {modes.map((mode) => {
        const Icon = mode.icon;
        return (
          <button
            key={mode.value}
            className={active === mode.value ? "active" : ""}
            onClick={() => onChange(mode.value)}
            role="tab"
            aria-selected={active === mode.value}
          >
            <Icon size={17} />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
