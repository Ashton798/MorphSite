import type { HTMLAttributes, ReactNode } from "react";

export function LiquidGlass({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={`liquid-glass ${className}`.trim()} {...props}>{children}</div>;
}
