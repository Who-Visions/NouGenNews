import { createRoot } from "react-dom/client";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./App.jsx";
import "./styles/glass.css";

createRoot(document.getElementById("root")).render(<App />);
