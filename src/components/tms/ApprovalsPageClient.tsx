"use client";

import { useCallback, useEffect, useState } from "react";
import { ApprovalQueue } from "@/components/tms/ApprovalQueue";
import { LoadBoard } from "@/components/tms/LoadBoard";
import type { LoadRecord } from "@/lib/tms/loads";

type Approval = {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
  tms_loads?: {
    load_number: string;
    origin_city: string;
    origin_state: string;
    destination_city: string;
    destination_state: string;
  } | null;
};

export function ApprovalsPageClient() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loads, setLoads] = useState<LoadRecord[]>([]);

  const refresh = useCallback(async () => {
    const [aRes, lRes] = await Promise.all([
      fetch("/api/approvals"),
      fetch("/api/loads"),
    ]);
    if (aRes.ok) {
      const data = await aRes.json();
      setApprovals(data.approvals ?? []);
    }
    if (lRes.ok) {
      const data = await lRes.json();
      setLoads(data.loads ?? []);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-8 p-4 md:p-8">
      <ApprovalQueue approvals={approvals} onRefresh={() => void refresh()} />
      <LoadBoard loads={loads} isSuper onRefresh={() => void refresh()} />
    </div>
  );
}
