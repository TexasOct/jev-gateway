import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { LocaleProvider } from "./i18n";
import "./tailwind.css";
import "./styles.css";

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
