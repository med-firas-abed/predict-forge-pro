import { createRoot } from "react-dom/client";
import { installBackendWarmup } from "@/lib/backendWarmup";
import App from "./App.tsx";
import "./index.css";

installBackendWarmup();

createRoot(document.getElementById("root")!).render(<App />);
