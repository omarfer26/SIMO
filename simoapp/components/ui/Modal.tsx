"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "full";
  closeOnBackdropClick?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = "md",
  closeOnBackdropClick = true,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setShow(true);
      document.body.style.overflow = "hidden";
    } else {
      const timer = setTimeout(() => setShow(false), 300); // Wait for transition
      document.body.style.overflow = "";
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || (!isOpen && !show)) return null;

  const maxWidthClass = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
    xl: "sm:max-w-xl",
    "2xl": "sm:max-w-2xl",
    "3xl": "sm:max-w-3xl",
    "4xl": "sm:max-w-4xl",
    "5xl": "sm:max-w-5xl",
    full: "sm:max-w-full sm:m-4",
  }[maxWidth];

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && closeOnBackdropClick) {
      onClose();
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Animated Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
        onClick={handleBackdropClick}
      />

      {/* Modal Panel */}
      <div
        className={`relative z-10 w-full bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col transform transition-all duration-300 ease-out ${maxWidthClass} ${
          isOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"
        }`}
      >
        {/* Header */}
        {/* SCRUM-loginMejora (Camilo) — Se quitó la condición `(title || onClose) &&`:
            onClose es obligatorio, así que siempre era verdadera y TypeScript
            la marcaba como error (el proyecto no compilaba). */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            {title ? (
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white" id="modal-title">
                {title}
              </h3>
            ) : <div />}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Cerrar modal"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(100vh-16rem)]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
