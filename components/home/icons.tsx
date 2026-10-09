export function BrandMark() {
  return (
    <svg className="app-brand-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 5.5 14.2 12 12 18.5 9.8 12Z" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="#f7f6f2" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.2 1.5H4.8L6 16.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M12 4v10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="m8 8 4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 14.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M4 20V6.5L12 3l8 3.5V20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 20v-5h6v5M9 9h.01M12 9h.01M15 9h.01M9 12.5h.01M12 12.5h.01M15 12.5h.01" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function strokeIcon(paths: string) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d={paths} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function HomeIcon() {
  return strokeIcon("M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1Z");
}

export function AskIcon() {
  return strokeIcon("M5 16.5 4 20l3.6-1.2A8 8 0 1 0 5 16.5Z");
}

export function ToolsIcon() {
  return strokeIcon("M14.5 6.5a3.5 3.5 0 0 0-4.9 4.3L4 16.4 7.6 20l5.6-5.6a3.5 3.5 0 0 0 4.3-4.9l-2.2 2.2-1.8-1.8 2-2.4Z");
}

export function OnboardingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M8 4h8v4H8zM6 8h12v12H6z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 13h6M9 16h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function DocumentsIcon() {
  return strokeIcon("M7 3.5h7l3 3V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1ZM9 11h6M9 15h4");
}

export function CovenantsIcon() {
  return strokeIcon("M5 6h14M5 12h14M5 18h9M16 16l2 2 3-4");
}

export function PositionIcon() {
  return strokeIcon("M4 18V6M4 18h16M7 14l3-4 3 2 4-6");
}

export function CapacityIcon() {
  return strokeIcon("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2");
}

export function LedgerIcon() {
  return strokeIcon("M5 4h14v16H5zM9 8h6M9 12h6M9 16h4");
}

export function SimulateIcon() {
  return strokeIcon("M5 12h14M13 6l6 6-6 6");
}

export function EvidenceIcon() {
  return strokeIcon("M8 4h6l3 3v13H8zM10 12h5M10 15h3M11 8h.01");
}
