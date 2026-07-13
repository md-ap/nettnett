// Form controls with the shared dark recipe (previously repeated 30+ times).
// Pass `label` to get the standard label above the control.

const CONTROL =
  "w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40 disabled:opacity-50";
const LABEL = "mb-1.5 block text-sm text-white/60";

export function Input({
  label,
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const control = <input {...rest} className={`${CONTROL} ${className}`} />;
  if (!label) return control;
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {control}
    </div>
  );
}

export function Select({
  label,
  className = "",
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const control = (
    <select {...rest} className={`${CONTROL} [&>option]:bg-neutral-900 ${className}`}>
      {children}
    </select>
  );
  if (!label) return control;
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {control}
    </div>
  );
}

export function Textarea({
  label,
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const control = <textarea {...rest} className={`${CONTROL} resize-none ${className}`} />;
  if (!label) return control;
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {control}
    </div>
  );
}
