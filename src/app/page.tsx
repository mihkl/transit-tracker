import { transitState } from "@/server/transit-state";
import { HomeClient } from "@/components/home-client";
import type { LineDto } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomeAsync() {
  await transitState.initializeAsync();

  const shapes = transitState.getShapes() ?? {};
  const lines: LineDto[] = transitState.getLines();

  return <HomeClient shapes={shapes} lines={lines} />;
}
