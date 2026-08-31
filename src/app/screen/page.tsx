import type { Metadata } from "next";

import { ScreenBoundary } from "./screen-boundary";
import { LiveScreen } from "./live-screen";

export const metadata: Metadata = { title: "Live Room | Construsoft Bootcamp" };

export default function ScreenPage() {
  return <ScreenBoundary><LiveScreen /></ScreenBoundary>;
}