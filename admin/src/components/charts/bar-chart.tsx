import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  axisProps,
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  colorVar,
  formatAxis,
  gridProps,
  seriesColor,
  type ChartColor,
  type ChartSeries,
  type ValueFormat,
} from "./chart";

export function BarChart<TRow extends Record<string, unknown>>({
  data,
  xKey,
  series,
  stacked = false,
  format = "number",
  xFormatter,
  className,
  legend = true,
}: {
  /** Undefined while loading: the chart's box is reserved with a placeholder. */
  data: TRow[] | undefined;
  xKey: keyof TRow & string;
  series: ChartSeries[];
  stacked?: boolean;
  format?: ValueFormat;
  xFormatter?: (value: string) => string;
  className?: string;
  /** While loading, whether to reserve a legend line (shown when there is more than one series). */
  legend?: boolean;
}) {
  if (!data) return <ChartFrame className={className} pending legend={legend} />;
  const colors: Record<string, ChartColor> = {};
  const labels: Record<string, string> = {};
  series.forEach((s, i) => {
    colors[s.key] = seriesColor(s, i);
    labels[s.key] = s.label;
  });

  return (
    <ChartFrame
      className={className}
      legend={
        series.length > 1 && (
          <ChartLegend items={series.map((s) => ({ label: s.label, color: colors[s.key]! }))} />
        )
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data as Record<string, unknown>[]}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="18%"
        >
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xKey as string} {...axisProps} tickFormatter={xFormatter} />
          <YAxis {...axisProps} width={60} tickFormatter={formatAxis} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                payload={payload}
                label={label}
                format={format}
                colors={colors}
                labels={labels}
                heading={xFormatter}
              />
            )}
          />
          {series.map((s, index) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "stack" : undefined}
              fill={colorVar(colors[s.key]!)}
              radius={stacked && index < series.length - 1 ? 0 : [1, 1, 0, 0]}
              maxBarSize={48}
              isAnimationActive={false}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
