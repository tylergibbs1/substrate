import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tooltip } from "@base-ui/react/tooltip";
import App from "./App.js";
import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import "./index.css";

// macOS Electron runs with titleBarStyle "hiddenInset": the traffic-light
// controls float over the top-left of the content. Flag the shell so the editor
// header can reserve that gutter (see `.is-electron .titlebar` in index.css).
// In the browser (Vite dev at :5173) there are no controls, so this stays off.
if (navigator.userAgent.includes("Electron")) {
  document.documentElement.classList.add("is-electron");
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 2000, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delay={300}>
        <App />
      </Tooltip.Provider>
    </QueryClientProvider>
  </StrictMode>,
);
