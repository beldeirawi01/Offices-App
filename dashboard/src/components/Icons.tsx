import { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function BrandMark(props: IconProps) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="4" y="13" width="3.4" height="7" rx="1.4" />
      <rect x="10.3" y="6.5" width="3.4" height="13.5" rx="1.4" />
      <rect x="16.6" y="9.5" width="3.4" height="10.5" rx="1.4" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="16" rx="2.2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4M16 3v4" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 20c.7-3.4 3-5.2 5.5-5.2s4.8 1.8 5.5 5.2" />
      <circle cx="17.5" cy="9.5" r="2.3" />
      <path d="M15.5 14.7c1.9.2 3.6 1.7 4.1 4.3" />
    </svg>
  );
}

export function InvoiceIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.5 3h9L19 6.5V20a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M15 3v4h4" />
      <path d="M8.5 12h7M8.5 15.3h7M8.5 8.7h3" />
    </svg>
  );
}

export function TeamIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c1-4 3.5-6 7-6s6 2 7 6" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .35 1.9l.05.05a2 2 0 1 1-2.9 2.9l-.05-.05a1.7 1.7 0 0 0-1.9-.35 1.7 1.7 0 0 0-1 1.55V19.6a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.9.35l-.05.05a2 2 0 1 1-2.9-2.9l.05-.05a1.7 1.7 0 0 0 .35-1.9 1.7 1.7 0 0 0-1.55-1H4.4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.35-1.9l-.05-.05a2 2 0 1 1 2.9-2.9l.05.05a1.7 1.7 0 0 0 1.9.35H10.5a1.7 1.7 0 0 0 1-1.55V4.4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.9-.35l.05-.05a2 2 0 1 1 2.9 2.9l-.05.05a1.7 1.7 0 0 0-.35 1.9V10.5a1.7 1.7 0 0 0 1.55 1H19.6a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.55 1Z" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function InboxEmptyIcon(props: IconProps) {
  return (
    <svg {...base} width={40} height={40} strokeWidth={1.4} {...props}>
      <path d="M4 13.5 6.3 5.8A1.5 1.5 0 0 1 7.7 4.7h8.6a1.5 1.5 0 0 1 1.4 1.1l2.3 7.7" />
      <path d="M4 13.5h4.8l1 2.4h4.4l1-2.4H20V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-5.5Z" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.3 2.3L16 10" />
    </svg>
  );
}

export function AlertCircleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} width={14} height={14} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
