import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { fetchControllerSettings, updateControllerSettings, type ControllerSettings } from "../api";
import { humanizeError } from "../lib/format";
import type { ToastSeverity } from "../types";

export default function SettingsPage({ onToast }: { onToast: (message: string, severity?: ToastSeverity) => void }) {
  const [settings, setSettings] = useState<ControllerSettings | null>(null);
  const [listen, setListen] = useState(":3493");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const payload = await fetchControllerSettings();
      setSettings(payload);
      setListen(payload.aggregate_nut_listen || ":3493");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleToggle() {
    if (!settings) {
      return;
    }
    setSaving(true);
    try {
      const updated = await updateControllerSettings({
        aggregate_nut_enabled: !settings.aggregate_nut_enabled,
        aggregate_nut_listen: listen,
      });
      setSettings(updated);
      setListen(updated.aggregate_nut_listen);
      onToast(updated.aggregate_nut_enabled ? "Aggregate NUT listener enabled." : "Aggregate NUT listener disabled.", "success");
      setError(null);
    } catch (saveError) {
      const message = humanizeError(saveError, "Settings update failed.");
      setError(message);
      onToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleListenSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) {
      return;
    }
    setSaving(true);
    try {
      const updated = await updateControllerSettings({
        aggregate_nut_listen: listen,
      });
      setSettings(updated);
      setListen(updated.aggregate_nut_listen);
      onToast(`Aggregate listener address set to ${updated.aggregate_nut_listen}.`, "success");
      setError(null);
    } catch (saveError) {
      const message = humanizeError(saveError, "Settings update failed.");
      setError(message);
      onToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h5" component="h2" sx={{ m: 0 }}>
          Controller settings
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Global controller controls for aggregate NUT exposure and admin-level operations.
        </Typography>
      </Box>
      {error ? (
        <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5, mb: 2.5 }}>
          <Typography color="text.secondary">{error}</Typography>
        </Box>
      ) : null}
      {!settings ? (
        <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
          <Typography color="text.secondary">Loading controller settings...</Typography>
        </Box>
      ) : (
        <Box>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1.5, mb: 1.5 }}>
            <Box>
              <Typography variant="h6" component="h3" sx={{ m: 0 }}>
                Aggregate NUT listener
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enable or disable the controller aggregate NUT TCP listener on port 3493 without restarting the controller.
              </Typography>
            </Box>
            <Chip label={settings.aggregate_nut_active ? "active" : "inactive"} color={settings.aggregate_nut_active ? "success" : "error"} />
          </Stack>

          <Grid container spacing={1.75} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Configured state
                  </Typography>
                  <Typography variant="h6" component="strong" sx={{ display: "block" }}>
                    {settings.aggregate_nut_enabled ? "enabled" : "disabled"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Persisted setting applied immediately and kept across controller restarts.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Listen address
                  </Typography>
                  <Typography variant="h6" component="strong" sx={{ display: "block" }}>
                    {settings.aggregate_nut_listen}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Use host:port or :port. Default is :3493.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Box sx={{ mb: 2 }}>
            <Button variant={settings.aggregate_nut_enabled ? "outlined" : "contained"} onClick={() => void handleToggle()} disabled={saving}>
              {saving ? "Applying..." : settings.aggregate_nut_enabled ? "Disable listener" : "Enable listener"}
            </Button>
          </Box>

          <Box component="form" onSubmit={handleListenSave}>
            <Grid container spacing={1.75} sx={{ alignItems: "flex-end" }}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField
                  fullWidth
                  label="Listener address"
                  value={listen}
                  onChange={(event) => setListen(event.target.value)}
                  placeholder=":3493"
                  disabled={saving}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: "auto" }}>
                <Button type="submit" variant="outlined" disabled={saving}>
                  Save address
                </Button>
              </Grid>
            </Grid>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
