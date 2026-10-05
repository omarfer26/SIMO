import React from "react";

export type SpinnerSize = "sm" | "md" | "lg" | "xl";
export type SpinnerColor = "primary" | "white" | "gray" | "success" | "danger" | "current";

export interface SpinnerProps {
  size?: SpinnerSize;
  color?: SpinnerColor;
  className?: string;
}

export function Spinner({ size = "md", color = "primary", className = "" }: SpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-8 h-8 border-3",
    xl: "w-12 h-12 border-4",
  };

  const colorClasses = {
    primary: "border-blue-600/30 border-t-blue-600 dark:border-blue-400/30 dark:border-t-blue-400",
    white: "border-white/30 border-t-white",
    gray: "border-gray-500/30 border-t-gray-500 dark:border-gray-400/30 dark:border-t-gray-400",
    success: "border-green-600/30 border-t-green-600 dark:border-green-400/30 dark:border-t-green-400",
    danger: "border-red-600/30 border-t-red-600 dark:border-red-400/30 dark:border-t-red-400",
    current: "border-current/30 border-t-current",
  };

  return (
    <div
      className={`animate-spin rounded-full ${sizeClasses[size]} ${colorClasses[color]} ${className}`}
      role="status"
      aria-label="Cargando..."
    >
      <span className="sr-only">Cargando...</span>
    </div>
  );
}
