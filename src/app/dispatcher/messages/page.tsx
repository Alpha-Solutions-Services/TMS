import { redirect } from "next/navigation";

export default function DispatcherMessagesRedirect() {
  redirect("/dispatcher/chat");
}
