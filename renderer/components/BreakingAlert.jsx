import "./BreakingAlert.css";

// The alert banner: red for a major story several outlets carry, amber for a smaller or local one. It sits at the
// top of the page, is announced to screen readers, and stays until it is read or dismissed.
export function BreakingAlert({ alert, onRead, onDismiss }) {
  if (!alert) return null;
  const red = alert.level === "red";
  const mins = Math.max(0, Math.round((Date.now() - alert.timestamp) / 60000));
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
  return (
    <div className={`ba ba--${alert.level}`} role="alert" aria-live="assertive">
      <span className="ba__label"><i className="ba__dot" aria-hidden="true" />{red ? "Red alert" : "Breaking"}</span>
      <button type="button" className="ba__headline" onClick={onRead} title={alert.headline}>{alert.headline}</button>
      <span className="ba__meta mono">{alert.demo ? "sample" : `${alert.sourceCount} sources · ${ago}`}</span>
      <button type="button" className="ba__read" onClick={onRead}>{alert.demo ? "Got it" : "Read"}</button>
      <button type="button" className="ba__x" aria-label="Dismiss alert" onClick={onDismiss}>&times;</button>
    </div>
  );
}
