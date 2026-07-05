import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import type { ChipProps } from "@mui/material/Chip";

// Compact KPI card inspired by the MUI dashboard template's stat cards
// (https://mui.com/material-ui/getting-started/templates/dashboard/): a muted
// label, a large value, and an optional caption, with a colored top accent
// instead of a filled "bubble" chip to signal severity.
export default function StatCard({
  label,
  value,
  caption,
  color = "default",
}: {
  label: string;
  value: string | number;
  caption?: string;
  color?: NonNullable<ChipProps["color"]>;
}) {
  const accent = color === "default" ? "divider" : `${color}.main`;
  return (
    <Card variant="outlined" sx={{ height: "100%", borderTop: 3, borderTopColor: accent }}>
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2, display: "block" }}>
          {label}
        </Typography>
        <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {caption ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {caption}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}
