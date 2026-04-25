"use client";

import type { ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";

type ConfirmationDialogProps = {
  busy?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
  description: ReactNode;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  open: boolean;
  title: string;
};

export function ConfirmationDialog({
  busy = false,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  description,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmationDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="ui-dialog-backdrop" role="presentation">
      <div
        aria-describedby="ui-confirmation-dialog-description"
        aria-modal="true"
        className="ui-dialog"
        role="dialog"
      >
        <div className="ui-dialog__content">
          <h2 className="ui-dialog__title">{title}</h2>
          <div className="ui-dialog__description" id="ui-confirmation-dialog-description">
            {description}
          </div>
          <div className={cn("ui-action-bar", "ui-dialog__actions")} data-align="end">
            <Button onClick={onCancel} variant="ghost">
              {cancelLabel}
            </Button>
            <Button busy={busy} onClick={() => void onConfirm()}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
