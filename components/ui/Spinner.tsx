const SIZES = {
  xs: "h-2 w-2 border",
  sm: "h-3 w-3 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
} as const;

// colorClass REPLACES the default border colors (never appended alongside)
// so tinted variants don't produce dueling border-color utilities.
export default function Spinner({
  size = "md",
  colorClass = "border-white/20 border-t-white/80",
  className = "",
}: {
  size?: keyof typeof SIZES;
  colorClass?: string;
  className?: string;
}) {
  return (
    <div
      className={`animate-spin rounded-full ${SIZES[size]} ${colorClass} ${className}`}
    />
  );
}
