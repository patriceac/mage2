import React from "react";
import ReactDOM from "react-dom/client";
import "@mage2/player-ui/styles.css";
import "./styles.css";
import "./panels/scenes/scenes.css";
import { App } from "./App";
import { DialogProvider } from "./dialogs";
import { EditorI18nProvider } from "./i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EditorI18nProvider>
      <DialogProvider>
        <App />
      </DialogProvider>
    </EditorI18nProvider>
  </React.StrictMode>
);
