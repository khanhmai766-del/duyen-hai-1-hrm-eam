"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "rounded-lg border border-border bg-white text-ink shadow-md",
          description: "text-muted-foreground",
          actionButton: "bg-accent text-white",
          success: "border-l-4 border-l-success",
          error: "border-l-4 border-l-destructive",
        },
      }}
      {...props}
    />
  );
}
