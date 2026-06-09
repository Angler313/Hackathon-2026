import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setVercelProtectionBypassToken } from "@workspace/api-client-react";

if (import.meta.env.VITE_VERCEL_BYPASS_TOKEN) {
  setVercelProtectionBypassToken(import.meta.env.VITE_VERCEL_BYPASS_TOKEN);
}

createRoot(document.getElementById("root")!).render(<App />);
