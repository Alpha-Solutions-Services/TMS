import type { Metadata } from "next";
import { PublicTrackClient } from "@/components/freight/PublicTrackClient";

export const metadata: Metadata = {
  title: "Load tracking — Alpha Freight Network",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function PublicTrackPage({
  params,
}: {
  params: { token: string };
}) {
  return <PublicTrackClient token={params.token} />;
}
