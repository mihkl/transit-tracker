"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Bus, TramFront, TrainFront, Zap } from "lucide-react";
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

interface LineSearchInputProps {
  value: { lineNumber: string; type: string } | null;
  onSelect: (line: { lineNumber: string; type: string } | null) => void;
}

const TYPE_ORDER = ["train", "tram", "trolleybus", "bus"];

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

export function LineSearchInput({ value, onSelect }: LineSearchInputProps) {
  const [query, setQuery] = useState(() => (value ? displayLabel(value) : ""));
  const [lines, setLines] = useState<LineDto[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/lines")
      .then((r) => r.json())
      .then((data: LineDto[]) => setLines(data))
      .catch((err) => console.error("Failed to load lines:", err));
  }, []);

  const uniqueLines = useMemo(() => {
    const seen = new Set<string>();
    return lines.filter((l) => {
      const key = `${l.type}_${l.lineNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
    const groups: Record<string, LineDto[]> = {};
    for (const line of filtered) {
      if (!groups[line.type]) groups[line.type] = [];
      groups[line.type].push(line);
    }
    for (const type of Object.keys(groups)) {
      groups[type].sort((a, b) => {
        const na = parseInt(a.lineNumber, 10);
        const nb = parseInt(b.lineNumber, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.lineNumber.localeCompare(b.lineNumber);
      });
    }
    return groups;
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleClear = () => {
    setQuery("");
    setShowDropdown(false);
    onSelect(null);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative flex items-center">
        <svg
          className="absolute left-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <Input
          className="w-full h-9 pl-8 pr-7 text-sm bg-gray-50 border-0 focus:bg-white focus:ring-1 focus:ring-gray-200 min-w-0"
          type="text"
          placeholder="Line"
          value={query}
          onChange={handleInput}
          onFocus={() => setShowDropdown(true)}
        />
        {value && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {showDropdown && (
        <div className="fixed left-3 right-3 top-16 z-[1100] md:absolute md:top-full md:left-0 md:right-auto md:mt-1.5 md:w-44">
          <Command
            className="bg-white border border-gray-100 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
            shouldFilter={false}
          >
            <CommandList>
              <CommandEmpty>No matching lines.</CommandEmpty>
              {TYPE_ORDER.filter(
                (type) => type !== "train" && grouped[type]?.length,
              ).map((type) => (
                <CommandGroup key={type} heading={TYPE_LABELS[type] ?? type}>
                  {grouped[type].map((line) => (
                    <CommandItem
                      key={`${line.type}_${line.lineNumber}`}
                      onSelect={() => handleSelect(line)}
                      className="cursor-pointer px-3 py-1.5 hover:bg-gray-50 rounded-md mx-1"
                    >
                      <TypeIcon type={line.type} className="shrink-0" />
                      <span className="text-sm">{line.lineNumber}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {showAllTrains && (
                <CommandGroup heading="Train">
                  <CommandItem
                    onSelect={handleSelectAllTrains}
                    className="cursor-pointer px-3 py-1.5 hover:bg-gray-50 rounded-md mx-1"
                  >
                    <TypeIcon type="train" className="shrink-0" />
                    <span className="text-sm">All Trains</span>
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
