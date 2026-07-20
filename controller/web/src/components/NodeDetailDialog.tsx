import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import { fetchNode, fetchNodeHealth, forgetNode, updateNode, type NodeHealthResponse, type NodeRecord } from "../api";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { formatBytes, formatNodeDisplayName, formatNodeReference, formatUPSMetrics, humanizeError, statusToSeverity } from "../lib/format";
import type { ConfirmRequest, ToastSeverity } from "../types";
import StatusChip from "./StatusChip";

const MAX_LABEL_LENGTH = 120;

type DetailValues = Pick<NodeRecord, "display_name" | "location_label" | "site_label">;

function fieldError(value: string): string | null {
  if (value.length > MAX_LABEL_LENGTH) {
    return `Must be ${MAX_LABEL_LENGTH} characters or fewer.`;
  }
  return null;
}

function OverviewTab({
  node,
  health,
  onOpenUPS,
}: {
  node: NodeRecord;
  health: NonNullable<NodeHealthResponse["health"]>;
  onOpenUPS: (upsName: string) => void;
}) {
  const locationBits = [node.location_label, node.site_label].filter(Boolean);
  return (
    <>
      <Grid container spacing={1.75} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Agent version
              </Typography>
              <Typography variant="h6" component="strong" sx={{ display: "block" }}>
                {health.version || node.version || "dev"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                CPU temp
              </Typography>
              <Typography variant="h6" component="strong" sx={{ display: "block" }}>
                {health.cpu_temperature_celsius != null ? `${health.cpu_temperature_celsius.toFixed(1)} C` : "unknown"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Disk free
              </Typography>
              <Typography variant="h6" component="strong" sx={{ display: "block" }}>
                {formatBytes(health.disk_free_bytes ?? 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Location
              </Typography>
              <Typography variant="h6" component="strong" sx={{ display: "block" }}>
                {locationBits.join(" / ") || "unassigned"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box>
        <Typography variant="h6" component="h3" sx={{ m: 0 }}>
          UPS inventory
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Drill into any UPS for live detail, history charts, and instant commands.
        </Typography>
        {!node.ups_summaries?.length ? (
          <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
            <Typography color="text.secondary">No UPS telemetry has been stored for this node yet.</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {node.ups_summaries.map((summary) => (
              <ListItemButton
                key={summary.name}
                onClick={() => onOpenUPS(summary.name)}
                sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, borderRadius: 1 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {summary.name}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.75, flexWrap: "wrap", minWidth: 0 }}>
                  {summary.status ? <StatusChip label={summary.status} severity={statusToSeverity(summary.status)} /> : null}
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "right" }}>
                    {formatUPSMetrics(summary)}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </>
  );
}

function ConfigTab({
  node,
  onToggle,
  onRelease,
  onSaveDetails,
}: {
  node: NodeRecord;
  onToggle: () => void;
  onRelease: () => void;
  onSaveDetails: (values: DetailValues) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(node.display_name || "");
  const [locationLabel, setLocationLabel] = useState(node.location_label || "");
  const [siteLabel, setSiteLabel] = useState(node.site_label || "");
  const [saving, setSaving] = useState(false);

  const errors = {
    display_name: fieldError(displayName),
    location_label: fieldError(locationLabel),
    site_label: fieldError(siteLabel),
  };
  const hasErrors = Boolean(errors.display_name || errors.location_label || errors.site_label);

  async function handleSave() {
    if (hasErrors || saving) {
      return;
    }
    setSaving(true);
    try {
      await onSaveDetails({
        display_name: displayName.trim(),
        location_label: locationLabel.trim(),
        site_label: siteLabel.trim(),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="body1">Details</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Display name and location/site labels shown across the fleet grid.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              error={Boolean(errors.display_name)}
              helperText={errors.display_name || " "}
              disabled={saving}
              size="small"
              fullWidth
            />
            <TextField
              label="Location label"
              value={locationLabel}
              onChange={(event) => setLocationLabel(event.target.value)}
              error={Boolean(errors.location_label)}
              helperText={errors.location_label || " "}
              disabled={saving}
              size="small"
              fullWidth
            />
            <TextField
              label="Site label"
              value={siteLabel}
              onChange={(event) => setSiteLabel(event.target.value)}
              error={Boolean(errors.site_label)}
              helperText={errors.site_label || " "}
              disabled={saving}
              size="small"
              fullWidth
            />
          </Stack>
          <Box sx={{ mt: 0.5 }}>
            <Button variant="contained" size="small" onClick={() => void handleSave()} disabled={hasErrors || saving}>
              Save details
            </Button>
          </Box>
        </CardContent>
      </Card>
      {node.adopted ? (
        <Card variant="outlined">
          <CardContent>
            <FormControlLabel
              control={<Switch checked={node.local_ui_policy_enabled} onChange={onToggle} />}
              label={
                <Box>
                  <Typography variant="body1">Local UI</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {node.local_ui_policy_managed
                      ? `Controller-managed: ${node.local_ui_policy_enabled ? "enabled" : "disabled"}.`
                      : "Node-managed. Toggling takes controller ownership of this setting."}
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", ml: 0, gap: 1.5 }}
            />
            {node.local_ui_policy_managed ? (
              <Box sx={{ mt: 1.5 }}>
                <Button variant="outlined" size="small" onClick={onRelease}>
                  Release local UI policy
                </Button>
              </Box>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
          <Typography color="text.secondary">Local UI policy can be managed only after adoption.</Typography>
        </Box>
      )}
    </Stack>
  );
}

export default function NodeDetailDialog({
  nodeId,
  onClose,
  onToast,
  requestConfirmation,
  onChanged,
  onOpenUPS,
}: {
  nodeId: string | null;
  onClose: () => void;
  onToast: (message: string, severity?: ToastSeverity) => void;
  requestConfirmation: (request: ConfirmRequest) => Promise<boolean>;
  onChanged: () => void;
  onOpenUPS: (nodeId: string, upsName: string) => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const open = Boolean(nodeId);
  const [node, setNode] = useState<NodeRecord | null>(null);
  const [health, setHealth] = useState<NodeHealthResponse["health"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  // Guards against a slow response for a previous nodeId applying its result
  // after the dialog has closed or switched to a different node.
  const activeNodeIdRef = useRef(nodeId);

  async function load(silent = false) {
    if (!nodeId) {
      return;
    }
    const requestedNodeId = nodeId;
    try {
      const [nodePayload, healthPayload] = await Promise.all([fetchNode(requestedNodeId), fetchNodeHealth(requestedNodeId)]);
      if (activeNodeIdRef.current !== requestedNodeId) {
        return;
      }
      setNode(nodePayload);
      setHealth(healthPayload.health);
      setError(null);
    } catch (loadError) {
      if (activeNodeIdRef.current !== requestedNodeId || silent) {
        return;
      }
      setError(humanizeError(loadError));
    }
  }

  useEffect(() => {
    activeNodeIdRef.current = nodeId;
    setTab(0);
    setNode(null);
    setHealth(null);
    setError(null);
    if (nodeId) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  useLiveRefresh(() => void load(true), 10_000, open);

  async function handleToggleLocalUIPolicy() {
    if (!node) {
      return;
    }
    const nextEnabled = !node.local_ui_policy_enabled;
    const verb = nextEnabled ? "enable" : "disable";
    const confirmed = await requestConfirmation({
      title: `${verb[0].toUpperCase()}${verb.slice(1)} local UI for ${formatNodeDisplayName(node)}?`,
      message: "This updates policy ownership from the controller and applies immediately.",
      confirmLabel: nextEnabled ? "Enable local UI" : "Disable local UI",
      tone: "warn",
    });
    if (!confirmed) {
      return;
    }
    try {
      const updated = await updateNode(node.id, { local_ui_policy_managed: true, local_ui_policy_enabled: nextEnabled });
      setNode(updated);
      onToast(nextEnabled ? "Controller enabled local UI." : "Controller disabled local UI.", "success");
      onChanged();
    } catch (updateError) {
      onToast(humanizeError(updateError, "Local UI policy update failed."), "error");
    }
  }

  async function handleReleaseLocalUIPolicy() {
    if (!node || !node.local_ui_policy_managed) {
      return;
    }
    const confirmed = await requestConfirmation({
      title: `Release local UI policy for ${formatNodeDisplayName(node)}?`,
      message: "After release, node-local administrators regain direct UI policy control.",
      confirmLabel: "Release policy",
      tone: "warn",
    });
    if (!confirmed) {
      return;
    }
    try {
      const updated = await updateNode(node.id, { local_ui_policy_managed: false });
      setNode(updated);
      onToast("Released controller local UI policy.", "success");
      onChanged();
    } catch (updateError) {
      onToast(humanizeError(updateError, "Local UI policy release failed."), "error");
    }
  }

  async function handleEdit(values: DetailValues) {
    if (!node) {
      return;
    }
    try {
      const updated = await updateNode(node.id, values);
      setNode(updated);
      onToast(`Updated details for ${formatNodeReference({ ...node, ...values })}.`, "success");
      onChanged();
    } catch (updateError) {
      onToast(humanizeError(updateError, "Update failed."), "error");
    }
  }

  async function handleForget() {
    if (!node) {
      return;
    }
    const reference = formatNodeReference(node);
    const confirmed = await requestConfirmation({
      title: `Forget ${formatNodeDisplayName(node)}?`,
      message: "This removes the controller record and stored trust material.",
      confirmLabel: "Forget node",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    try {
      await forgetNode(node.id);
      onToast(`Forgot ${reference}.`, "success");
      onChanged();
      onClose();
    } catch (forgetError) {
      onToast(humanizeError(forgetError, "Forget failed."), "error");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="span" sx={{ display: "block" }}>
            {node ? formatNodeDisplayName(node) : "Node detail"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Live controller-to-node reads.
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close node detail" size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Tabs value={tab} onChange={(_event, value: number) => setTab(value)} sx={{ px: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Overview" />
        <Tab label="Config" />
      </Tabs>
      <DialogContent dividers>
        {error ? (
          <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
            <Typography color="text.secondary">{error}</Typography>
          </Box>
        ) : !node || !health ? (
          <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
            <Typography color="text.secondary">Loading node detail...</Typography>
          </Box>
        ) : tab === 0 ? (
          <OverviewTab node={node} health={health} onOpenUPS={(upsName) => onOpenUPS(node.id, upsName)} />
        ) : (
          <ConfigTab
            node={node}
            onToggle={() => void handleToggleLocalUIPolicy()}
            onRelease={() => void handleReleaseLocalUIPolicy()}
            onSaveDetails={handleEdit}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "flex-start", px: 3, py: 1.5 }}>
        <Button variant="outlined" color="error" size="small" onClick={() => void handleForget()} disabled={!node}>
          Forget node
        </Button>
      </DialogActions>
    </Dialog>
  );
}
