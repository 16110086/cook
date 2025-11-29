import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { Toaster } from "@/components/ui/sonner";
import { DebugLogger } from "@/components/DebugLogger";

// Disable native context menu on Mac/Linux (except for input fields)
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  const tagName = target.tagName.toLowerCase();
  const isEditable = target.isContentEditable;
  const isInput = tagName === "input" || tagName === "textarea";
  
  // Allow context menu only for input fields
  if (!isInput && !isEditable) {
    e.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster position="bottom-left" duration={1000} />
    <div className="fixed bottom-2 left-2 z-50">
      <DebugLogger />
    </div>
  </StrictMode>
);
