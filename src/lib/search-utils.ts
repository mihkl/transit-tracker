import type { LineDto } from "@/lib/types";

export const TYPE_ORDER = ["train", "tram", "trolleybus", "bus"] as const;

export const STOP_TYPE_COLORS: Record<string, string> = {
  B: "#1565C0",
  T: "#C62828",
  t: "#2E7D32",
  K: "#E65100",
};

export function uniqueLines(lines: LineDto[]): LineDto[] {
  const seen = new Set<string>();
  return lines.filter((l) => {
    const key = `${l.type}_${l.lineNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function groupAndSortLines(lines: LineDto[]): Record<string, LineDto[]> {
  const groups: Record<string, LineDto[]> = {};
  for (const line of lines) {
    if (!groups[line.type]) groups[line.type] = [];
    groups[line.type].push(line);
  }

  for (const type of Object.keys(groups)) {
    groups[type].sort((a, b) => {
      const na = parseInt(a.lineNumber, 10);
      const nb = parseInt(b.lineNumber, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.lineNumber.localeCompare(b.lineNumber);
    });
  }

  return groups;
}
