"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ChartPoint } from "@/types/analytics";

const chartConfig = {
  value: { label: "Value", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

export function BarChartCard({ data, color = "var(--color-chart-2)" }: { data: ChartPoint[]; color?: string }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} animationDuration={300} animationEasing="ease-out" />
      </BarChart>
    </ChartContainer>
  );
}
