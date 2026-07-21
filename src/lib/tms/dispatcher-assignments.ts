import { absoluteUrl } from "@/data/site";

export function tmsLoginUrl(): string {
  return absoluteUrl("/login");
}

export type AssigneeType = "carrier" | "driver";

export type TeamAssignment = {
  dispatcherUserId: string;
  dispatcherName: string;
  assigneeType: AssigneeType;
  assigneeId: string;
  assigneeLabel: string;
};
