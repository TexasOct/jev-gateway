import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/app/App";
import { LocaleProvider } from "@/shared/i18n/index";
import "./styles/index.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Dashboard root element is missing.");
}

createRoot(container).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
