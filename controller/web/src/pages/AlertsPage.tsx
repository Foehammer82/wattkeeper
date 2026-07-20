import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import type { SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import StatusChip from "../components/StatusChip";
import {
  createAlertRule,
  deleteAlertRule,
  fetchAlertEvents,
  fetchAlertRules,
  testAlertRule,
  type AlertEvent,
  type AlertRule,
} from "../api";
import { humanizeError } from "../lib/format";
import type { ConfirmRequest, ToastSeverity } from "../types";

const ALERT_KINDS = ["node_offline", "comms_lost", "on_battery", "low_battery"] as const;

export default function AlertsPage({
  onToast,
  requestConfirmation,
}: {
  onToast: (message: string, severity?: ToastSeverity) => void;
  requestConfirmation: (request: ConfirmRequest) => Promise<boolean>;
}) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ kind: "node_offline", webhook_url: "", debounce_seconds: 300, threshold: "20" });

  async function load() {
    try {
      const [rulesPayload, eventsPayload] = await Promise.all([fetchAlertRules(), fetchAlertEvents()]);
      setRules(Array.isArray(rulesPayload.rules) ? rulesPayload.rules : []);
      setEvents(Array.isArray(eventsPayload.events) ? eventsPayload.events : []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createAlertRule({
        kind: form.kind,
        webhook_url: form.webhook_url,
        debounce_seconds: form.debounce_seconds,
        threshold: form.kind === "low_battery" ? Number(form.threshold) : undefined,
        ups_var: form.kind === "low_battery" ? "battery.charge" : undefined,
      });
      onToast(`Created ${form.kind} alert rule.`, "success");
      await load();
    } catch (createError) {
      onToast(humanizeError(createError, "Alert rule creation failed."), "error");
    }
  }

  async function handleDelete(id: number) {
    const confirmed = await requestConfirmation({
      title: `Delete alert rule ${id}?`,
      message: "This permanently removes the rule and stops future alert deliveries for it.",
      confirmLabel: "Delete rule",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteAlertRule(id);
      onToast(`Deleted alert rule ${id}.`, "success");
      await load();
    } catch (deleteError) {
      onToast(humanizeError(deleteError, "Delete failed."), "error");
    }
  }

  async function handleTest(id: number) {
    try {
      await testAlertRule(id);
      onToast(`Test-fired alert rule ${id}.`, "success");
      await load();
    } catch (testError) {
      onToast(humanizeError(testError, "Test-fire failed."), "error");
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h5" component="h2" sx={{ m: 0 }}>
          Alerts
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Webhook-only Phase 3 alerting with debounce and recent event history.
        </Typography>
      </Box>
      {error ? (
        <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5, mb: 2.5 }}>
          <Typography color="text.secondary">{error}</Typography>
        </Box>
      ) : null}

      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" component="h3" sx={{ m: 0 }}>
            Create rule
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Global rules only, keeping Phase 3 simple.
          </Typography>
          <Box component="form" onSubmit={handleCreate}>
            <Grid container spacing={1.75} sx={{ alignItems: "flex-end" }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <FormControl fullWidth>
                  <InputLabel id="alert-kind-label">Kind</InputLabel>
                  <Select
                    labelId="alert-kind-label"
                    label="Kind"
                    value={form.kind}
                    onChange={(event: SelectChangeEvent) => setForm((current) => ({ ...current, kind: event.target.value }))}
                  >
                    {ALERT_KINDS.map((kind) => (
                      <MenuItem key={kind} value={kind}>
                        {kind}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Webhook URL"
                  value={form.webhook_url}
                  onChange={(event) => setForm((current) => ({ ...current, webhook_url: event.target.value }))}
                  placeholder="https://example.invalid/webhook"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  type="number"
                  label="Debounce seconds"
                  slotProps={{ htmlInput: { min: 1 } }}
                  value={form.debounce_seconds}
                  onChange={(event) => setForm((current) => ({ ...current, debounce_seconds: Number(event.target.value) || 300 }))}
                />
              </Grid>
              {form.kind === "low_battery" ? (
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Threshold (%)"
                    slotProps={{ htmlInput: { min: 1, max: 100 } }}
                    value={form.threshold}
                    onChange={(event) => setForm((current) => ({ ...current, threshold: event.target.value }))}
                  />
                </Grid>
              ) : null}
              <Grid size={{ xs: 12 }}>
                <Button type="submit" variant="contained">
                  Create rule
                </Button>
              </Grid>
            </Grid>
          </Box>
        </Box>

        <Box>
          <Typography variant="h6" component="h3" sx={{ m: 0 }}>
            Rules
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Existing webhook alert rules.
          </Typography>
          {!rules.length ? (
            <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
              <Typography color="text.secondary">No alert rules yet.</Typography>
            </Box>
          ) : (
            <TableContainer variant="outlined" component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Rule</TableCell>
                    <TableCell>Kind</TableCell>
                    <TableCell>Webhook</TableCell>
                    <TableCell>Debounce</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>#{rule.id}</TableCell>
                      <TableCell>{rule.kind}</TableCell>
                      <TableCell sx={{ wordBreak: "break-all" }}>{rule.webhook_url}</TableCell>
                      <TableCell>
                        {rule.debounce_seconds}s{rule.threshold != null ? ` • ${rule.threshold}%` : ""}
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                          <Button size="small" variant="outlined" onClick={() => void handleTest(rule.id)}>
                            Test fire
                          </Button>
                          <Button size="small" variant="outlined" color="error" onClick={() => void handleDelete(rule.id)}>
                            Delete
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        <Box>
          <Typography variant="h6" component="h3" sx={{ m: 0 }}>
            Recent events
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Newest alert events first.
          </Typography>
          {!events.length ? (
            <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
              <Typography color="text.secondary">No alert events yet.</Typography>
            </Box>
          ) : (
            <TableContainer variant="outlined" component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Kind</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell>Occurred</TableCell>
                    <TableCell>Delivery</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.kind}</TableCell>
                      <TableCell>{event.message}</TableCell>
                      <TableCell>{new Date(event.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        {event.delivered ? (
                          <StatusChip label="Delivered" severity="success" />
                        ) : (
                          <Stack spacing={0.5}>
                            <StatusChip label="Delivery failed" severity="error" />
                            <Typography variant="caption" color="text.secondary">
                              {humanizeError(event.delivery_error || "unknown error")}
                            </Typography>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
