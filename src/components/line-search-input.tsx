"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import { Bus, TramFront, TrainFront, Zap } from "lucide-react";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/constants";
import type { LineDto } from "@/lib/types";
import { TYPE_ORDER, groupAndSortLines, uniqueLines as buildUniqueLines } from "@/lib/search-utils";

interface LineSearchInputProps {
  value: { lineNumber: string; type: string } | null;
  onSelect: (line: { lineNumber: string; type: string } | null) => void;
  lines: LineDto[];
}

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const color = TYPE_COLORS[type] ?? TYPE_COLORS.unknown;
  const props = { size: 16, className, style: { color } };
  switch (type) {
    case "tram":
      return <TramFront {...props} />;
    case "trolleybus":
      return <Zap {...props} />;
    case "bus":
      return <Bus {...props} />;
    case "train":
      return <TrainFront {...props} />;
    default:
      return <Bus {...props} />;
  }
}

function displayLabel(line: { lineNumber: string; type: string }) {
  if (line.type === "train" && !line.lineNumber) return "All Trains";
  return `${TYPE_LABELS[line.type] ?? line.type} ${line.lineNumber}`;
}

export { TypeIcon };

export function LineSearchInput({ value, onSelect, lines }: LineSearchInputProps) {
  const [query, setQuery] = useState(() => (value ? displayLabel(value) : ""));
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const uniqueLines = useMemo(() => {
    return buildUniqueLines(lines);
  }, [lines]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return uniqueLines;
    return uniqueLines.filter(
      (l) =>
        l.lineNumber.toLowerCase().includes(q) ||
        (TYPE_LABELS[l.type] ?? l.type).toLowerCase().includes(q),
    );
  }, [uniqueLines, query]);

  const grouped = useMemo(() => {
    return groupAndSortLines(filtered);
  }, [filtered]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setShowDropdown(true);
    if (val.trim() === "") {
      onSelect(null);
    }
  };

  const handleSelect = (line: LineDto) => {
    setQuery(displayLabel(line));
    setShowDropdown(false);
    onSelect({ lineNumber: line.lineNumber, type: line.type });
  };

  const handleSelectAllTrains = () => {
    const val = { lineNumber: "", type: "train" };
    setQuery(displayLabel(val));
    setShowDropdown(false);
    onSelect(val);
  };

  const showAllTrains = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q || "all trains".includes(q) || "train".includes(q);
  }, [query]);

  const closeDropdown = useCallback(() => setShowDropdown(false), []);
  useClickOutside(wrapperRef, closeDropdown);

  const handleClear = () => {
    setQuery("");
    setShowDropdown(false);
    onSelect(null);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative flex items-center">
        <Icon
          name="clock"
          className="absolute left-2.5 w-3.5 h-3.5 text-foreground/30 pointer-events-none"
        />
        <Input
          className="w-full h-9 pl-8 pr-7 text-sm bg-foreground/[0.04] border-0 rounded-xl focus:bg-white focus:ring-1 focus:ring-foreground/10 focus:shadow-sm min-w-0 transition-all duration-150 placeholder:text-foreground/30"
          type="text"
          placeholder="Line"
          value={query}
          onChange={handleInput}
          onFocus={() => setShowDropdown(true)}
        />
        {value && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-foreground/10 text-foreground/30 hover:text-foreground/50 transition-colors"
          >
            <Icon name="x-close" size={14} />
          </button>
        )}
      </div>
      {showDropdown && (
        <div className="fixed left-3 right-3 top-16 z-[1100] md:absolute md:top-full md:left-0 md:right-auto md:mt-2 md:w-48 animate-scale-in">
          <Command
            className="bg-white border border-foreground/5 rounded-xl shadow-dropdown"
            shouldFilter={false}
          >
            <CommandList>
              <CommandEmpty>No matching lines.</CommandEmpty>
              {TYPE_ORDER.filter((type) => type !== "train" && grouped[type]?.length).map(
                (type) => (
                  <CommandGroup key={type} heading={TYPE_LABELS[type] ?? type}>
                    {grouped[type].map((line) => (
                      <CommandItem
                        key={`${line.type}_${line.lineNumber}`}
                        onSelect={() => handleSelect(line)}
                        className="cursor-pointer px-3 py-1.5 hover:bg-foreground/[0.04] rounded-lg mx-1 transition-colors"
                      >
                        <TypeIcon type={line.type} className="shrink-0" />
                        <span className="text-sm font-medium">{line.lineNumber}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ),
              )}
              {showAllTrains && (
                <CommandGroup heading="Train">
                  <CommandItem
                    onSelect={handleSelectAllTrains}
                    className="cursor-pointer px-3 py-1.5 hover:bg-foreground/[0.04] rounded-lg mx-1 transition-colors"
                  >
                    <TypeIcon type="train" className="shrink-0" />
                    <span className="text-sm font-medium">All Trains</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
