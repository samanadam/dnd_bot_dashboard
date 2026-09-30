import type { Metadata } from "next";
import { DemoDmHome } from "@/components/demo/dm/DemoDmHome";

export const metadata: Metadata = { title: "DM Screen" };

export default function DemoDmPage() {
  return <DemoDmHome />;
}
