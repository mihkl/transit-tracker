import Image from "next/image";

const INCIDENT_LABELS: Record<number, string> = {
  1: "Accident",
  2: "Fog",
  3: "Hazard",
  4: "Rain",
  5: "Ice",
  6: "Slow Traffic",
  7: "Lane Closed",
  8: "Road Closed",
  9: "Road Works",
  10: "Wind",
  11: "Flooding",
  14: "Breakdown",
};

export function IncidentIcon({ category, size = 28 }: { category: number; size?: number }) {
  const label = INCIDENT_LABELS[category] || "Incident";
  const iconFile = INCIDENT_LABELS[category] ? `incident-${category}` : "incident-default";
  return (
    <Image src={`/icons/${iconFile}.svg`} width={size} height={size} alt={label} />
  );
}

export function PinIcon({
  color,
  label,
  width = 24,
  height = 32,
}: {
  color: string;
  label: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 24 32"
      role="img"
      aria-label={label}
    >
      <path
        d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z"
        fill={color}
      />
      <circle cx={12} cy={12} r={5} fill="#fff" />
      <text
        x={12}
        y={15}
        textAnchor="middle"
        fill={color}
        fontSize={8}
        fontWeight="bold"
        fontFamily="system-ui"
      >
        {label}
      </text>
    </svg>
  );
}

export function StopIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 12 12"
      role="img"
      aria-label="Stop"
    >
      <rect x={2} y={2} width={8} height={8} rx={2} fill="#fff" stroke="#666" strokeWidth={1.5} />
    </svg>
  );
}

export function UserHeadingIndicator({
  heading,
  mapBearing = 0,
}: {
  heading: number;
  mapBearing?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={44}
      height={44}
      viewBox="0 0 44 44"
      aria-hidden="true"
      style={{
        display: "block",
        pointerEvents: "none",
        transform: `rotate(${heading - mapBearing}deg)`,
      }}
    >
      <path d="M22 3 33 25Q22 18 11 25Z" fill="#60a5fa" opacity={0.28} />
      <path d="M22 7 29 22Q22 18 15 22Z" fill="#2563eb" opacity={0.62} />
    </svg>
  );
}

export function BoardingStopIcon({
  lineNumber,
  color,
  size = 20,
}: {
  lineNumber: string;
  color: string;
  size?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      role="img"
      aria-label={`Line ${lineNumber}`}
    >
      <circle cx={10} cy={10} r={8} fill={color} stroke="#fff" strokeWidth={2} />
      <text
        x={10}
        y={14}
        textAnchor="middle"
        fill="#fff"
        fontSize={9}
        fontWeight="bold"
        fontFamily="system-ui"
      >
        {lineNumber}
      </text>
    </svg>
  );
}
