import {
  emptyLoadForm,
  formValuesToPayload,
  type LoadFormValues,
} from "@/components/freight/LoadFormModal";

/** Map AI-parsed RC/BOL fields into the load form. */
export function rcFieldsToLoadFormValues(
  fields: Record<string, string>,
  defaultBookedBy = "",
): LoadFormValues {
  const base = emptyLoadForm(defaultBookedBy);
  return {
    ...base,
    companyName: fields.companyName?.trim() || base.companyName,
    broker: fields.broker?.trim() || base.broker,
    loadDetails: fields.loadDetails?.trim() || base.loadDetails,
    pickupDateTime: fields.pickupDateTime?.trim() || base.pickupDateTime,
    deliveryDateTime: fields.deliveryDateTime?.trim() || base.deliveryDateTime,
    miles: fields.miles?.trim() || base.miles,
    loadNumber: fields.loadNumber?.trim() || base.loadNumber,
    states: fields.states?.trim() || base.states,
    rcInvoice: fields.rcInvoice?.trim() || base.rcInvoice,
    truckTrailer: fields.truckTrailer?.trim() || base.truckTrailer,
    notes: fields.notes?.trim() || base.notes,
  };
}

export function rcFieldsToLoadPayload(
  fields: Record<string, string>,
  monthTab: string,
  bookedBy?: string,
) {
  return formValuesToPayload(rcFieldsToLoadFormValues(fields, bookedBy), monthTab);
}

export type CreateLoadFromRcResult = {
  ok: boolean;
  id?: string;
  sr?: number;
  pendingApproval?: boolean;
  message?: string;
  error?: string;
};

/** Create load from parsed RC fields and attach RC PDF/image to the load. */
export async function createLoadFromRc(opts: {
  fields: Record<string, string>;
  file?: File | null;
  monthTab: string;
  bookedBy?: string;
}): Promise<CreateLoadFromRcResult> {
  const payload = rcFieldsToLoadPayload(opts.fields, opts.monthTab, opts.bookedBy);
  if (!payload.companyName) {
    return { ok: false, error: "Company name is required — re-upload a clearer RC" };
  }

  const res = await fetch("/api/dispatcher/loads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as CreateLoadFromRcResult & { error?: string };
  if (!res.ok) {
    return { ok: false, error: json.error ?? "Could not create load" };
  }

  if (opts.file && json.id) {
    const form = new FormData();
    form.set("loadId", json.id);
    form.set("type", "rate_con");
    form.set("file", opts.file);
    const docRes = await fetch("/api/freight/loads/documents", { method: "POST", body: form });
    if (!docRes.ok) {
      const docJson = (await docRes.json()) as { error?: string };
      return {
        ok: true,
        id: json.id,
        sr: json.sr,
        pendingApproval: json.pendingApproval,
        message:
          (json.message ?? `Load SR-${json.sr} created.`) +
          ` RC file not attached: ${docJson.error ?? "upload failed"}`,
      };
    }
  }

  const parts = [
    json.pendingApproval
      ? json.message ?? "Submitted for super dispatcher approval."
      : `Load saved (SR-${json.sr}).`,
    opts.file ? "RC attached — visible to carrier & driver." : null,
  ].filter(Boolean);

  return {
    ok: true,
    id: json.id,
    sr: json.sr,
    pendingApproval: json.pendingApproval,
    message: parts.join(" "),
  };
}
