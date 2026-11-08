export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? "logo-small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M8 6h12l5 6-5 6h-6v9H8V6Z" fill="currentColor" />
        <path d="m14 10 7 4-7 4v-8Z" className="logo-cut" />
        <path
          d="m21 23 4 4"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
