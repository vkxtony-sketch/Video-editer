import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <App />
        <Toaster
          richColors
          closeButton
          position="top-right"
          theme="dark"
          toastOptions={{
            classNames: {
              toast:
                "!bg-card/95 !border !border-border/80 !text-foreground !backdrop-blur",
              description: "!text-muted-foreground",
            },
          }}
        />
      </BrowserRouter>
    </ConvexProvider>
  </React.StrictMode>,
);
