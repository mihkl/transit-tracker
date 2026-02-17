import { transitState } from "@/lib/server/transit-state";
import { HomeClient } from "@/components/home-client";
import type { LineDto } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  await transitState.initialize();

  const shapes = transitState.getShapes() ?? {};
  const lines: LineDto[] = transitState.getLines();

  return <HomeClient shapes={shapes} lines={lines} />;
}
