import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import type { ConfirmRequest } from "../types";

export default function ConfirmDialog({
  request,
  onAccept,
  onCancel,
}: {
  request: ConfirmRequest;
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onCancel}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id="confirm-dialog-title">
        <Typography variant="overline" color="text.secondary" component="p" sx={{ m: 0, lineHeight: 1.4 }}>
          Confirm action
        </Typography>
        {request.title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="confirm-dialog-description">{request.message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">
          {request.cancelLabel || "Cancel"}
        </Button>
        <Button
          onClick={onAccept}
          variant="contained"
          color={request.tone === "danger" ? "error" : request.tone === "warn" ? "warning" : "primary"}
          autoFocus
        >
          {request.confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
