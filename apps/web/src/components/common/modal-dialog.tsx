"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const maxWidthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

export function ModalDialog({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = "lg",
}: ModalDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity animate-in fade-in"
      />

      {/* Modal Card */}
      <div
        className={`relative z-10 w-full ${maxWidthMap[maxWidth]} bg-card text-card-foreground border border-border/80 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200`}
      >
        <div className="flex items-start justify-between p-6 border-b border-border/70 bg-muted/20">
          <div>
            <h2 id="modal-dialog-title" className="text-xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground font-normal">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 max-h-[calc(85vh-120px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
