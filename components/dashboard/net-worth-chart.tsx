"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type NetWorthChartPoint = { label: string; net_worth: number | string };

function money(value: number | string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(typeof value === "number" ? value : Number(value));
}

export function NetWorthChart({ data }: { data: NetWorthChartPoint[] }) {
  return (
    <ResponsiveContainer height="100%" width="100%">
      <LineChart data={data} margin={{ top: 8, right: 5, bottom: 0, left: -18 }}>
        <XAxis
          axisLine={false}
          dataKey="label"
          minTickGap={28}
          tick={{ fill: "#8c8375", fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          tick={{ fill: "#8c8375", fontSize: 11 }}
          tickFormatter={money}
          tickLine={false}
          width={64}
        />
        <Tooltip
          contentStyle={{ border: "1px solid #d8cfc0", borderRadius: "8px", background: "#fffdf9", color: "#2b2621" }}
          formatter={(value) => money(String(value))}
          labelStyle={{ color: "#8c8375" }}
        />
        <Line
          activeDot={{ r: 4, fill: "#c1673b" }}
          dataKey="net_worth"
          dot={false}
          stroke="#c35d30"
          strokeWidth={2.5}
          type="monotone"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
