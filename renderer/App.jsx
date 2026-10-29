import { NewsView } from "./components/NewsView.jsx";
import { BrowserSidebar } from "./components/BrowserSidebar.jsx";

export function App() {
  return (
    <div className="app-shell">
      <main className="app-main"><NewsView /></main>
      <BrowserSidebar />
    </div>
  );
}
