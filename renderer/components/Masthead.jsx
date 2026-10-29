import { useEffect, useState } from "react";
import "./Masthead.css";

// The nameplate of the edition: title between double rules, then a dateline (edition, date, count).
// The date is the reader's local day, spelled out like a newspaper's.
export function Masthead({ storyCount, libraryCount }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const day = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const hour = now.getHours();
  const edition = hour < 12 ? "Morning edition" : hour < 18 ? "Afternoon edition" : "Evening edition";
  return (
    <header className="mast">
      <div className="mast__rule" />
      <h1 className="mast__title">NouGenNews</h1>
      <div className="mast__rule mast__rule--double" />
      <div className="mast__line">
        <span>{edition}</span>
        <span className="mast__day">{day}</span>
        <span>{storyCount} dispatches{libraryCount ? ` · ${libraryCount} from your library` : ""}</span>
      </div>
    </header>
  );
}
