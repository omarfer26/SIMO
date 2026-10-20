import React from "react";

export type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "info";
export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  pill?: boolean;
}

export function Badge({
  children,
  variant = "default",
  size = "md",
  pill = false,
  className = "",
  ...props
}: BadgeProps) {
  const baseClasses = "inline-flex items-center justify-center font-medium transition-colors";
  
  const variantClasses = {
    default: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    primary: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    success: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    info: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  };

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-0.5",
    lg: "text-base px-3 py-1",
  };

  const roundedClasses = pill ? "rounded-full" : "rounded-md";

  return (
    <span
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${roundedClasses} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
