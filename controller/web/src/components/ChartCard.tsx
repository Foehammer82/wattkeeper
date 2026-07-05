import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// NOTE: this still uses `recharts` rather than `@mui/x-charts`. Replacing the charting
// library is tracked as follow-up work (see mui-development SKILL.md); this pass only
// wraps the existing chart in themed MUI `Card`/`CardContent` per the migration plan.

// recharts renders an SVG with no accessible text, so this component pairs it with an
// aria-label summary (role="img") and a visually-hidden data table so screen reader
// users get equivalent information instead of a silent graphic.
const visuallyHiddenSx = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: "1px",
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: "1px",
} as const;

export type ChartTone = "primary" | "success" | "warning";

function summarizeSeries(data: Array<{ timestamp: string; value: number }>) {
  if (data.length === 0) {
    return null;
  }
  const values = data.map((point) => point.value);
  const latest = data[data.length - 1];
  return {
    latest: latest.value,
    latestAt: latest.timestamp,
    min: Math.min(...values),
    max: Math.max(...values),
    count: data.length,
  };
}

export default function ChartCard({
  title,
  data,
  tone = "primary",
}: {
  title: string;
  data: Array<{ timestamp: string; value: number }>;
  tone?: ChartTone;
}) {
  const theme = useTheme();
  const stroke = theme.palette[tone].main;
  const summary = summarizeSeries(data);
  const ariaLabel = summary
    ? `${title} chart. Latest ${summary.latest} at ${summary.latestAt}. Range ${summary.min} to ${summary.max} across ${summary.count} samples.`
    : `${title} chart. No stored samples yet.`;

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
        <Box role="img" aria-label={ariaLabel} sx={{ minHeight: 220, mt: 1 }}>
          {data.length === 0 ? (
            <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
              <Typography color="text.secondary">No stored samples yet.</Typography>
            </Box>
          ) : (
            <Box aria-hidden="true">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data}>
                  <XAxis dataKey="timestamp" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} minTickGap={24} />
                  <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} width={48} />
                  <Tooltip
                    contentStyle={{
                      background: theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: 8,
                      color: theme.palette.text.primary,
                    }}
                  />
                  <Line type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Box>
        {summary ? (
          <Box component="table" sx={visuallyHiddenSx}>
            <caption>{title} summary</caption>
            <tbody>
              <tr>
                <th scope="row">Latest</th>
                <td>
                  {summary.latest} at {summary.latestAt}
                </td>
              </tr>
              <tr>
                <th scope="row">Minimum</th>
                <td>{summary.min}</td>
              </tr>
              <tr>
                <th scope="row">Maximum</th>
                <td>{summary.max}</td>
              </tr>
              <tr>
                <th scope="row">Samples</th>
                <td>{summary.count}</td>
              </tr>
            </tbody>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
}
