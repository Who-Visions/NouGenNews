import { useEffect, useState } from "react";
import { invoke } from "../lib/bridge.js";

// Frames from the cameras nearest the reader while a red warning is up. Shows nothing when no NouGen//Eye server answers.
export function AlertCameras({ city }) {
  const [frames, setFrames] = useState([]);
  useEffect(() => {
    let live = true;
    const pull = () => invoke("alert_cameras", { city }).then((f) => { if (live && Array.isArray(f) && f.length) setFrames(f); }).catch(() => {});
    pull();
    const t = setInterval(pull, 30000);
    return () => { live = false; clearInterval(t); };
  }, [city]);
  if (!frames.length) return null;
  return (
    <div className="ba-cams" aria-label="Live cameras near you">
      {frames.map((f) => (
        <figure key={f.id} className="ba-cam">
          <img src={f.src} alt={f.name} />
          <figcaption>{f.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}
