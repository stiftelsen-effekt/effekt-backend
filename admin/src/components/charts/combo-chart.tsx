import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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
  formatValue,
  gridProps,
  seriesColor,
  type ChartColor,
  type ChartSeries,
  type ValueFormat,
} from "./chart";

/** Stacked bars (e.g. amount per cause area) with a line on a secondary axis (e.g. donor count). */
export function StackedBarLineChart<TRow extends Record<string, unknown>>({
  data,
  xKey,
  bars,
  line,
  format = "money",
  lineFormat = "number",
  xFormatter,
  className,
}: {
  data: TRow[];
  xKey: keyof TRow & string;
  bars: ChartSeries[];
  line: ChartSeries;
  format?: ValueFormat;
  lineFormat?: ValueFormat;
  xFormatter?: (value: string) => string;
  className?: string;
}) {
  const colors: Record<string, ChartColor> = {};
  const labels: Record<string, string> = {};
  bars.forEach((s, i) => {
    colors[s.key] = seriesColor(s, i);
    labels[s.key] = s.label;
  });
  const lineColor: ChartColor = line.color ?? "chart-2";
  colors[line.key] = lineColor;
  labels[line.key] = line.label;

  return (
    <ChartFrame
      className={className}
      legend={
        <ChartLegend
          items={[
            ...bars.map((s) => ({ label: s.label, color: colors[s.key]!, kind: "bar" as const })),
            { label: line.label, color: lineColor, kind: "line" as const },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data as Record<string, unknown>[]}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="18%"
        >
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xKey as string} {...axisProps} tickFormatter={xFormatter} />
          <YAxis yAxisId="bars" {...axisProps} width={60} tickFormatter={formatAxis} />
          <YAxis
            yAxisId="line"
            orientation="right"
            {...axisProps}
            width={48}
            tickFormatter={formatAxis}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                payload={payload?.filter((entry) => entry.dataKey !== line.key)}
                label={label}
                format={format}
                colors={colors}
                labels={labels}
                heading={(value) => {
                  const row = data.find((r) => String(r[xKey]) === value);
                  const heading = xFormatter ? xFormatter(value) : value;
                  return row
                    ? `${heading} · ${formatValue(
                        Number(row[line.key]),
                        lineFormat,
                      )} ${line.label.toLowerCase()}`
                    : heading;
                }}
              />
            )}
          />
          {bars.map((s, index) => (
            <Bar
              key={s.key}
              yAxisId="bars"
              dataKey={s.key}
              stackId="stack"
              fill={colorVar(colors[s.key]!)}
              radius={index === bars.length - 1 ? [1, 1, 0, 0] : 0}
              maxBarSize={48}
              isAnimationActive={false}
            />
          ))}
          <Line
            yAxisId="line"
            dataKey={line.key}
            type="monotone"
            stroke={colorVar(lineColor)}
            strokeWidth={2}
            dot={{ r: 2.5, fill: "var(--background)", strokeWidth: 1.5 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
