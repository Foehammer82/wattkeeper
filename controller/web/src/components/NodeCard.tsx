import type { KeyboardEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ChipProps } from "@mui/material/Chip";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import StatusChip from "./StatusChip";
import { adoptNode, forgetNode, type NodeRecord } from "../api";
import {
  commsStateToSeverity,
  formatCommsState,
  formatNodeDisplayName,
  formatNodeReference,
  humanizeError,
  statusToSeverity,
} from "../lib/format";
import type { ConfirmRequest, ToastSeverity } from "../types";

function statusColor(status: string): ChipProps["color"] {
  if (status === "pending") {
    return "warning";
  }
  if (status === "adopted-online") {
    return "success";
  }
  return "error";
}

export default function NodeCard({
  node,
  onChanged,
  onToast,
  requestConfirmation,
  onOpenDetail,
  onOpenUPS,
}: {
  node: NodeRecord;
  onChanged: () => void;
  onToast: (message: string, severity?: ToastSeverity) => void;
  requestConfirmation: (request: ConfirmRequest) => Promise<boolean>;
  onOpenDetail: (nodeId: string) => void;
  onOpenUPS: (nodeId: string, upsName: string) => void;
}) {
  const color = statusColor(node.status);
  const commsSeverity = commsStateToSeverity(node.comms_state);
  const title = formatNodeDisplayName(node);
  const nodeReference = formatNodeReference(node);
  const locationBits = [node.location_label, node.site_label].filter(Boolean);

  async function handleAdopt() {
    try {
      await adoptNode(node.id);
      onToast(`Adopted ${nodeReference}.`, "success");
      onChanged();
    } catch (error) {
      onToast(humanizeError(error, "Adoption failed."), "error");
    }
  }

  async function handleForget() {
    const confirmed = await requestConfirmation({
      title: `Forget ${title}?`,
      message: "This removes the controller record and stored trust material.",
      confirmLabel: "Forget node",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    try {
      await forgetNode(node.id);
      onToast(`Forgot ${nodeReference}.`, "success");
      onChanged();
    } catch (error) {
      onToast(humanizeError(error, "Forget failed."), "error");
    }
  }

  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column", borderLeft: 4, borderLeftColor: `${color}.main` }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Box
          {...(node.adopted
            ? {
                role: "button",
                tabIndex: 0,
                onClick: () => onOpenDetail(node.id),
                onKeyDown: (event: KeyboardEvent) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenDetail(node.id);
                  }
                },
                "aria-label": `Open details for ${nodeReference}`,
              }
            : {})}
          sx={{
            borderRadius: 1,
            mx: -1,
            px: 1,
            ...(node.adopted
              ? {
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
                }
              : {}),
          }}
        >
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1.5 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary" component="p" sx={{ m: 0 }}>
                {node.id}
              </Typography>
              <Typography variant="h6" component="h4" sx={{ m: 0 }}>
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary" component="p" sx={{ m: 0 }}>
                {node.address || "address unavailable"}
                {node.port ? ` • port ${node.port}` : ""}
              </Typography>
            </Box>
            {node.status === "adopted-online" ? <StatusChip label="Online" severity="success" /> : null}
            {node.status === "adopted-offline" ? <StatusChip label="Offline" severity="error" /> : null}
            {node.status === "pending" && node.live ? (
              <Button variant="contained" color="warning" size="small" onClick={() => void handleAdopt()}>
                Adopt
              </Button>
            ) : null}
          </Stack>

          <Divider sx={{ my: 1.5 }} />

          <Stack spacing={0.75}>
            {[
              ["Version", node.version || "dev"],
              ["UPS count", String(node.ups_count)],
              ...(node.status === "pending" || (node.status === "adopted-online" && node.comms_state === "healthy")
                ? []
                : [["Comms", formatCommsState(node.comms_state, node.poll_failures, node.last_poll_error)]]),
              ["Location", locationBits.join(" / ") || "unassigned"],
            ].map(([label, value]) => (
              <Box key={label} sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, fontSize: "0.86rem" }}>
                <Typography variant="body2" color="text.secondary" component="span">
                  {label}
                </Typography>
                <Typography
                  variant="body2"
                  component="span"
                  sx={{
                    textAlign: "right",
                    fontWeight: 600,
                    ...(label === "Comms" && commsSeverity !== "default" ? { color: `${commsSeverity}.main` } : {}),
                  }}
                >
                  {value}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>

        {(() => {
          const alerting = (node.ups_summaries ?? []).filter((summary) => {
            const severity = statusToSeverity(summary.status);
            return severity === "error" || severity === "warning";
          });
          if (alerting.length === 0) {
            return null;
          }
          return (
            <Box sx={{ mt: 1.5, borderTop: 1, borderColor: "divider", pt: 1 }}>
              <Typography variant="overline" color="error.main" sx={{ lineHeight: 1.2 }}>
                UPS alerts
              </Typography>
              <List dense disablePadding>
                {alerting.map((summary) => (
                  <ListItemButton
                    key={summary.name}
                    disableGutters
                    sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, borderRadius: 1, px: 0.75 }}
                    onClick={() => onOpenUPS(node.id, summary.name)}
                  >
                    <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
                      {summary.name}
                    </Typography>
                    {summary.status ? <StatusChip label={summary.status} severity={statusToSeverity(summary.status)} /> : null}
                  </ListItemButton>
                ))}
              </List>
            </Box>
          );
        })()}
      </CardContent>
      {!node.adopted ? (
        <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 2 }}>
          {node.status === "pending" && node.live ? (
            <Box />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Waiting for node to come online.
            </Typography>
          )}
          <Tooltip title="Forget node">
            <IconButton aria-label={`Forget ${nodeReference}`} size="small" onClick={() => void handleForget()}>
              <PersonRemoveOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </CardActions>
      ) : null}
      </Card>
  );
}
