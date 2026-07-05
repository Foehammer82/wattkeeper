import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import type { ToastRequest } from "../types";

// Errors persist until manually dismissed so they can't be missed on a phone or
// during a fast-moving incident; success/info/warning toasts still auto-hide.
const AUTO_HIDE_MS: Record<ToastRequest["severity"], number | null> = {
  success: 3200,
  info: 3200,
  warning: 4500,
  error: null,
};

export default function ToastSnackbar({ request, onClose }: { request: ToastRequest | null; onClose: () => void }) {
  return (
    <Snackbar
      open={Boolean(request)}
      autoHideDuration={request ? AUTO_HIDE_MS[request.severity] : null}
      onClose={(_event, reason) => {
        if (reason === "clickaway") {
          return;
        }
        onClose();
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert onClose={onClose} severity={request?.severity ?? "info"} variant="filled" sx={{ width: "100%" }}>
        {request?.message}
      </Alert>
    </Snackbar>
  );
}
