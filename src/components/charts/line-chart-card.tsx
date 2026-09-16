"use client";

import { Line, LineChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ChartPoint } from "@/types/analytics";

const chartConfig = {
  value: { label: "Value", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

export function LineChartCard({ data }: { data: ChartPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--color-chart-1)"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "var(--color-chart-1)" }}
          activeDot={{ r: 5 }}
          animationDuration={300}
          animationEasing="ease-out"
        />
      </LineChart>
    </ChartContainer>
  );
}
