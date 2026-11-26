import {
StrictMode,
} from "react";

import {
createRoot,
} from "react-dom/client";

import App from "./app";
import AuthGate from "./components/AuthGate";
import "./styles/globals.css";

createRoot(
document.getElementById("root")!,
).render(
    <StrictMode>
        <AuthGate><App /></AuthGate>
    </StrictMode>,
);
