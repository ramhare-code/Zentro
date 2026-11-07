const PATHS: Record<string, string> = {
  home: "M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
  box: "M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10",
  folder: "M3 6h6l2 2h10v11H3z",
  tag: "M3 12V4h8l10 10-8 8zM7.5 8.5h.01",
  layers: "m12 3 9 5-9 5-9-5zM3 13l9 5 9-5",
  truck: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a1.6 1.6 0 1 0 0-.1M17 19a1.6 1.6 0 1 0 0-.1",
  clipboard: "M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4",
  cart: "M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  rupee: "M6 4h12M6 9h12M9 4c6 0 6 10 0 10H6l9 7",
  users: "M9 11a4 4 0 1 0 0-.1M2 21c1-4 4-6 7-6s6 2 7 6M16 4a4 4 0 0 1 0 7.5M18 15c2 .7 3.5 2.6 4 6",
  headset: "M4 14v-2a8 8 0 0 1 16 0v2M3 14h4v6H3zM17 14h4v6h-4z",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  message: "M4 5h16v11H8l-4 4z",
  ticket: "M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3zM14 4v12",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15 9h.01",
  badge: "M12 3 4 6v6c0 4.4 3.4 7.8 8 9 4.6-1.2 8-4.6 8-9V6zM12 11a2.5 2.5 0 1 0 0-.1M8 17c.8-1.8 2.3-2.5 4-2.5s3.2.7 4 2.5",
  shield: "M12 3 4.5 6v6c0 4.4 3.2 7.8 7.5 9 4.3-1.2 7.5-4.6 7.5-9V6zM9 12l2 2 4-4",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  page: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  cog: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  alert: "M12 3 2 20h20zM12 10v4M12 17h.01",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M5 12l7 7 7-7",
};

export function Icon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable={false} className={className}>
      <path d={PATHS[name] ?? PATHS.box} />
    </svg>
  );
}
