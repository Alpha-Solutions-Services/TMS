"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RevenuePoint } from "@/lib/freight/carrier-dashboard-types";

const tooltipStyle = {
  background: "#0b1120",
  border: "1px solid rgba(56,163,255,0.25)",
  borderRadius: 8,
  color: "#edf2f8",
  fontSize: 12,
};

export function CarrierWeeklyRevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="carrierRevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38a3ff" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#38a3ff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(56,163,255,0.08)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#6a8caf", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#6a8caf", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="#38a3ff"
          strokeWidth={2}
          fill="url(#carrierRevGrad)"
          animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CarrierMonthlyRevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="rgba(56,163,255,0.08)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#6a8caf", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#6a8caf", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
        <Line
          type="monotone"
          dataKey="amount"
          stroke="#5bc8ff"
          strokeWidth={2}
          dot={{ fill: "#38a3ff", r: 3 }}
          animationDuration={900}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CarrierRpmChart({ data }: { data: RevenuePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="rgba(56,163,255,0.08)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#6a8caf", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={["auto", "auto"]} tick={{ fill: "#6a8caf", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`$${Number(v).toFixed(2)}`, "RPM"]} />
        <Line type="monotone" dataKey="amount" stroke="#38a3ff" strokeWidth={2} dot={{ fill: "#38a3ff" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
