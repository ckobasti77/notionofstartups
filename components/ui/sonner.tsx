"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/theme-provider";

function Toaster(props: ToasterProps) {
  const { mounted, resolvedTheme } = useTheme();
  return (
    <Sonner
      position="bottom-right"
      theme={mounted ? resolvedTheme : "system"}
      containerAriaLabel="Obaveštenja"
      richColors
      closeButton
      {...props}
    />
  );
}

export { Toaster };
