import Spinner from "./Spinner";

const VARIANTS = {
  primary: "bg-white/10 text-white hover:bg-white/20",
  secondary: "border border-white/20 bg-white/10 text-white hover:bg-white/20",
  outline: "border border-white/20 text-white/70 hover:bg-white/10 hover:text-white",
  ghost: "text-white/50 hover:text-white",
  danger: "border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20",
  dangerSolid: "bg-red-600 font-semibold text-white hover:bg-red-500",
} as const;

const SIZES = {
  xs: "px-3 py-1.5 text-xs font-medium",
  sm: "px-3 py-1 text-sm",
  md: "px-4 py-2 text-sm",
} as const;

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading && <Spinner size="xs" colorClass="border-white/30 border-t-white" />}
      {children}
    </button>
  );
}
