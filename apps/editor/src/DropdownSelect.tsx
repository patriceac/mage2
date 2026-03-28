import { forwardRef, type SelectHTMLAttributes } from "react";

interface DropdownSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
}

export const DropdownSelect = forwardRef<HTMLSelectElement, DropdownSelectProps>(function DropdownSelect(
  { wrapperClassName, className, children, disabled, ...props },
  ref
) {
  const wrapperClasses = ["dropdown-select", wrapperClassName, disabled ? "dropdown-select--disabled" : undefined]
    .filter(Boolean)
    .join(" ");
  const selectClasses = ["dropdown-select__native", className].filter(Boolean).join(" ");

  return (
    <div className={wrapperClasses}>
      <select ref={ref} className={selectClasses} disabled={disabled} {...props}>
        {children}
      </select>
      <span className="dropdown-select__trigger" aria-hidden="true">
        <svg viewBox="0 0 16 16">
          <path
            d="M4.03 5.97a.75.75 0 0 1 1.06 0L8 8.88l2.91-2.91a.75.75 0 1 1 1.06 1.06l-3.44 3.44a.75.75 0 0 1-1.06 0L4.03 7.03a.75.75 0 0 1 0-1.06Z"
            fill="currentColor"
          />
        </svg>
      </span>
    </div>
  );
});
