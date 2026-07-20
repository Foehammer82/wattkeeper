import Chip from "@mui/material/Chip";
import type { ChipProps } from "@mui/material/Chip";
import type { SxProps, Theme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import HelpIcon from "@mui/icons-material/Help";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { SvgIconComponent } from "@mui/icons-material";
import type { StatusSeverity } from "../lib/format";

const SEVERITY_ICON: Record<StatusSeverity, SvgIconComponent> = {
  error: ErrorIcon,
  warning: WarningAmberIcon,
  success: CheckCircleIcon,
  default: HelpIcon,
};

const SEVERITY_COLOR: Record<StatusSeverity, ChipProps["color"]> = {
  error: "error",
  warning: "warning",
  success: "success",
  default: "default",
};

// Status is conveyed with color, an icon, AND the text label so it never relies on
// color alone (WCAG 1.4.1 Use of Color).
export default function StatusChip({
  label,
  severity,
  size = "small",
  variant = "filled",
  sx,
}: {
  label: string;
  severity: StatusSeverity;
  size?: ChipProps["size"];
  variant?: ChipProps["variant"];
  sx?: SxProps<Theme>;
}) {
  const Icon = SEVERITY_ICON[severity];
  return (
    <Chip
      label={label}
      color={SEVERITY_COLOR[severity]}
      size={size}
      variant={variant}
      icon={<Icon fontSize="small" />}
      sx={sx}
    />
  );
}
