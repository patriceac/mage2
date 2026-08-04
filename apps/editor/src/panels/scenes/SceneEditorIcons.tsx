export function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5H7Z" fill="currentColor" />
    </svg>
  );
}

export function SceneToolIcon({ kind }: { kind: "select" | "pan" | "zoom" | "fit" | "edit" | "plus" | "corner-first" }) {
  if (kind === "edit") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="m5 16.8-.7 3 3-.7L17.8 8.6l-2.3-2.3L5 16.8Zm11.8-11.9 1.1-1.1a1.55 1.55 0 0 1 2.2 2.2L19 7.1"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  }

  if (kind === "plus") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (kind === "select") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5.8 3.8 18.2 12l-6.15 1.05-2.85 5.85L5.8 3.8Z"
          fill="currentColor"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="0.8"
        />
      </svg>
    );
  }

  if (kind === "pan") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8.3 12.1V7.45a1.25 1.25 0 0 1 2.5 0v4.35m0-.45V5.85a1.25 1.25 0 0 1 2.5 0v5.35m0-3.35a1.25 1.25 0 0 1 2.5 0v5.55l.85-.95a1.35 1.35 0 0 1 2 1.8l-2.95 3.75A5.1 5.1 0 0 1 11.7 20h-.9a4.8 4.8 0 0 1-4.8-4.8v-3.1a1.15 1.15 0 0 1 2.3 0Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.65"
        />
      </svg>
    );
  }

  if (kind === "zoom") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M10.6 16.8a6.2 6.2 0 1 1 0-12.4 6.2 6.2 0 0 1 0 12.4Zm4.5-1.7 4.2 4.2M10.6 8v5.2m-2.6-2.6h5.2"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
      </svg>
    );
  }

  if (kind === "corner-first") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6.5 17.5V6.5h11"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <circle cx="6.5" cy="6.5" r="2" fill="currentColor" />
        <circle cx="12" cy="6.5" r="1.15" fill="currentColor" opacity="0.55" />
        <circle cx="6.5" cy="12" r="1.15" fill="currentColor" opacity="0.55" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5.2 9V5.2H9m9.8 3.8V5.2H15M5.2 15v3.8H9m9.8-3.8v3.8H15"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.85"
      />
    </svg>
  );
}

export function SceneActionIcon({ kind }: { kind: "hotspot" | "item" | "delete" }) {
  if (kind === "hotspot") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.9v3.25m0 11.7v3.25M2.9 12h3.25m11.7 0h3.25" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.05" />
        <circle cx="12" cy="12" r="5.25" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="1.35" fill="currentColor" />
      </svg>
    );
  }

  if (kind === "item") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 9.2 12 5.8l6 3.4v7.2L12 19.8l-6-3.4V9.2Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.9"
        />
        <path
          d="m8.25 8.05 6.05 3.45 1.45-.82-6.05-3.45M6.25 9.35 12 12.7l5.75-3.35M12 12.7v6.75"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.45"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.35 8.3h9.3l-.72 11.2H8.07L7.35 8.3ZM5.5 6.1h13M9.35 6.1l.75-2h3.8l.75 2M10.1 10.8v6.25m3.8-6.25v6.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.95"
      />
    </svg>
  );
}
