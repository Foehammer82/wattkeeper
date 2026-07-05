import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import NodeCard from "../components/NodeCard";
import NodeDetailDialog from "../components/NodeDetailDialog";
import StatCard from "../components/StatCard";
import UPSDetailDialog from "../components/UPSDetailDialog";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { fetchNodes, type NodeRecord } from "../api";
import { commsStateToSeverity, statusToSeverity } from "../lib/format";
import type { ConfirmRequest, ToastSeverity } from "../types";


export default function FleetPage({
  onToast,
  requestConfirmation,
  reloadSignal,
}: {
  onToast: (message: string, severity?: ToastSeverity) => void;
  requestConfirmation: (request: ConfirmRequest) => Promise<boolean>;
  reloadSignal: number;
}) {
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openNodeId = searchParams.get("node");
  const openUpsNodeId = searchParams.get("upsNode");
  const openUpsName = searchParams.get("ups");

  // Opening pushes a history entry (so the browser Back button closes the
  // modal instead of leaving the fleet page), and closing pops that same
  // entry so the X button and Back button behave identically.
  function openDetail(nodeId: string) {
    setSearchParams({ node: nodeId }, { replace: false });
  }

  function closeDetail() {
    navigate(-1);
  }

  // Kept as separate params from `node` so opening a UPS from a card (without
  // the node modal already open) doesn't also open the node modal underneath.
  // Opening from inside the node modal keeps the existing `node` param and
  // layers the UPS params on top, so Back closes just the UPS modal first.
  function openUPS(nodeId: string, upsName: string) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("upsNode", nodeId);
        next.set("ups", upsName);
        return next;
      },
      { replace: false },
    );
  }

  function closeUPS() {
    navigate(-1);
  }

  async function loadNodes(silent = false) {
    try {
      if (!silent) {
        setLoading(true);
      }
      const payload = await fetchNodes();
      setNodes(payload.nodes ?? []);
      setError(null);
    } catch (loadError) {
      // Background/silent refreshes fail quietly and keep showing the last known
      // good inventory rather than flashing the whole list to an error state.
      if (!silent) {
        setError(loadError instanceof Error ? loadError.message : "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNodes();
  }, [reloadSignal]);

  useLiveRefresh(() => void loadNodes(true));

  const offlineNodes = nodes.filter((node) => node.status === "adopted-offline" || commsStateToSeverity(node.comms_state) === "error");
  const degradedNodes = nodes.filter((node) => commsStateToSeverity(node.comms_state) === "warning");
  const upsAttention = nodes.reduce(
    (summary, node) => {
      for (const ups of node.ups_summaries ?? []) {
        const severity = statusToSeverity(ups.status);
        if (severity === "error") {
          summary.error += 1;
        } else if (severity === "warning") {
          summary.warning += 1;
        }
      }
      return summary;
    },
    { error: 0, warning: 0 },
  );
  const hasAlerts = offlineNodes.length > 0 || degradedNodes.length > 0 || upsAttention.error > 0 || upsAttention.warning > 0;
  const alertCount = offlineNodes.length + degradedNodes.length + upsAttention.error + upsAttention.warning;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 2.5 }}>
      <Typography variant="h6" component="h2" sx={{ m: 0, mb: 1.5 }}>
        Fleet
      </Typography>
      <Grid container spacing={1.75} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatCard label="Nodes" value={nodes.length} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatCard label="Offline" value={offlineNodes.length} color={offlineNodes.length > 0 ? "error" : "success"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatCard label="Alerts" value={alertCount} color={hasAlerts ? "error" : "success"} />
        </Grid>
      </Grid>

      {error ? (
        <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
          <Typography color="text.secondary">{error}</Typography>
        </Box>
      ) : null}
      {!error && loading ? (
        <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
          <Typography color="text.secondary">Loading controller inventory...</Typography>
        </Box>
      ) : null}
      {!error && !loading ? (
        nodes.length === 0 ? (
          <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
            <Typography color="text.secondary">No nodes discovered yet.</Typography>
          </Box>
        ) : (
          <Grid container spacing={1.75}>
            {nodes.map((node) => (
              <Grid key={node.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <NodeCard
                  node={node}
                  onChanged={() => void loadNodes(true)}
                  onToast={onToast}
                  requestConfirmation={requestConfirmation}
                  onOpenDetail={openDetail}
                  onOpenUPS={openUPS}
                />
              </Grid>
            ))}
          </Grid>
        )
      ) : null}
      <NodeDetailDialog
        nodeId={openNodeId}
        onClose={closeDetail}
        onToast={onToast}
        requestConfirmation={requestConfirmation}
        onChanged={() => void loadNodes(true)}
        onOpenUPS={openUPS}
      />
      <UPSDetailDialog
        nodeId={openUpsNodeId}
        upsName={openUpsName}
        onClose={closeUPS}
        onToast={onToast}
        requestConfirmation={requestConfirmation}
      />
    </Paper>
  );
}
