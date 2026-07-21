import { FREIGHT_TEAM_EMAIL } from "./constants";

/** Carrier load emails only send when the load row has an email address. */
export function resolveLoadCarrierEmail(loadEmail?: string | null): string | null {
  const trimmed = loadEmail?.trim();
  if (!trimmed || trimmed === "—") return null;
  return trimmed;
}

/** Notify the acting dispatcher and freight team (deduped). */
export async function notifyDispatchRecipients(
  actorEmail: string | null | undefined,
  send: (to: string) => Promise<unknown>,
): Promise<void> {
  const recipients = new Set<string>();
  const actor = actorEmail?.trim();
  if (actor) recipients.add(actor);
  const team = FREIGHT_TEAM_EMAIL?.trim();
  if (team) recipients.add(team);

  await Promise.all(
    Array.from(recipients).map((to) => send(to).catch(() => {})),
  );
}

export function computeDispatchFee(
  rcInvoice: number,
  dispatchPercent: number,
  dispatchFee?: number,
): number {
  if (dispatchFee != null && dispatchFee > 0) return dispatchFee;
  if (rcInvoice > 0 && dispatchPercent > 0) {
    return Math.round((rcInvoice * dispatchPercent) / 100 * 100) / 100;
  }
  return 0;
}

export function computeBalance(dispatchFee: number, received: number): number {
  return Math.max(0, Math.round((dispatchFee - received) * 100) / 100);
}
