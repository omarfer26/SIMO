import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  variant?: "rectangular" | "circular" | "text";
}

export function Skeleton({ className = "", variant = "rectangular", ...props }: SkeletonProps) {
  const variantClasses = {
    rectangular: "rounded-md",
    circular: "rounded-full",
    text: "rounded-md h-4 w-full",
  };

  return (
    <div
      className={`animate-pulse bg-gray-200 dark:bg-gray-800 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
