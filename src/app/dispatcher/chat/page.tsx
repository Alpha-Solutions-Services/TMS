import type { Metadata } from "next";
import { DispatcherChatClient } from "@/components/freight/DispatcherChatClient";

export const metadata: Metadata = {
  title: "Chat — Dispatcher",
};

export default function DispatcherChatPage() {
  return <DispatcherChatClient />;
}
