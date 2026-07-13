"use client";

import { useEffect } from "react";

const WIDTHS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
} as const;

// Shared modal shell (the overlay+panel recipe previously copy-pasted ~10x).
// Parent conditionally renders it: {open && <Modal onClose={...}>...</Modal>}
// Escape always closes; backdrop click closes unless closeOnBackdrop={false}
// (use that for destructive confirmations).
export default function Modal({
  onClose,
  children,
  maxWidth = "md",
  scrollable = false,
  closeOnBackdrop = true,
  className = "",
}: {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: keyof typeof WIDTHS;
  scrollable?: boolean;
  closeOnBackdrop?: boolean;
  className?: string;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${WIDTHS[maxWidth]} rounded-lg border border-white/20 bg-black p-6 ${
          scrollable ? "max-h-[90vh] overflow-y-auto" : ""
        } ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
