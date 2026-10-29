import { NewsView } from "./components/NewsView.jsx";
import { MenuBar } from "./components/MenuBar.jsx";
import { BrowserSidebar } from "./components/BrowserSidebar.jsx";

export function App() {
  return (
    <div className="app-frame">
      <MenuBar />
      <div className="app-shell">
        <main className="app-main"><NewsView /></main>
        <BrowserSidebar />
      </div>
    </div>
  );
}
