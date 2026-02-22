const tallinnFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Tallinn",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function getSecondsOfDayInTallinn(date: Date): number {
  const parts = tallinnFmt.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const second = Number(parts.find((p) => p.type === "second")?.value ?? "0");
  return hour * 3600 + minute * 60 + second;
}
