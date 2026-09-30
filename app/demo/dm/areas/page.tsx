import type { Metadata } from "next";
import { DemoAreas } from "@/components/demo/dm/DemoLists";

export const metadata: Metadata = { title: "Areas" };

export default function DemoAreasPage() {
  return <DemoAreas />;
}
