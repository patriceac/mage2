import React from "react";
import ReactDOM from "react-dom/client";
import "reactflow/dist/style.css";
import "./styles.css";
import { App } from "./App";
import { DialogProvider } from "./dialogs";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </React.StrictMode>
);
