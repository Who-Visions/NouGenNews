// The hero headline, whole and readable at a glance. It wraps to as many lines as it needs, up to four, and the type
// steps down with its length so a long headline fits instead of scrolling away from the reader (it used to loop
// right to left, which left the first words off screen half the time).
const size = (n) => (n <= 60 ? "xl" : n <= 110 ? "l" : "m");

export function HeroTitle({ title }) {
  return <h2 className={`nh-title nh-title--wrap nh-title--${size(String(title || "").length)}`} title={title}>{title}</h2>;
}
