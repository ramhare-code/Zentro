import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 22, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export const SearchIcon = (p: IconProps) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const CartIcon = (p: IconProps) => (<svg {...base(p)}><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" /><circle cx="10" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></svg>);
export const HeartIcon = (p: IconProps) => (<svg {...base(p)}><path d="M12 20s-7-4.4-9-9.1C1.6 7.4 3.8 4 7.2 4c2 0 3.4 1.1 4.8 2.8C13.4 5.1 14.8 4 16.8 4c3.4 0 5.6 3.4 4.2 6.9C19 15.6 12 20 12 20Z" /></svg>);
export const UserIcon = (p: IconProps) => (<svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6" /></svg>);
export const MenuIcon = (p: IconProps) => (<svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const CloseIcon = (p: IconProps) => (<svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const HomeIcon = (p: IconProps) => (<svg {...base(p)}><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></svg>);
export const GridIcon = (p: IconProps) => (<svg {...base(p)}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>);
export const ChevronLeft = (p: IconProps) => (<svg {...base(p)}><path d="m15 5-7 7 7 7" /></svg>);
export const ChevronRight = (p: IconProps) => (<svg {...base(p)}><path d="m9 5 7 7-7 7" /></svg>);
export const ChevronDown = (p: IconProps) => (<svg {...base(p)}><path d="m5 9 7 7 7-7" /></svg>);
export const StarIcon = (p: IconProps) => (<svg {...base({ ...p, strokeWidth: 0 })} fill="currentColor"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>);
export const FilterIcon = (p: IconProps) => (<svg {...base(p)}><path d="M4 6h16M7 12h10M10 18h4" /></svg>);
export const TruckIcon = (p: IconProps) => (<svg {...base(p)}><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></svg>);
export const ShieldIcon = (p: IconProps) => (<svg {...base(p)}><path d="M12 3 4.5 6v6c0 4.4 3.2 7.8 7.5 9 4.3-1.2 7.5-4.6 7.5-9V6z" /><path d="m9 12 2 2 4-4" /></svg>);
export const ReturnIcon = (p: IconProps) => (<svg {...base(p)}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>);
export const HeadsetIcon = (p: IconProps) => (<svg {...base(p)}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></svg>);
export const PlayIcon = (p: IconProps) => (<svg {...base(p)}><path d="M8 5v14l11-7z" fill="currentColor" /></svg>);
export const ZoomIcon = (p: IconProps) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" /></svg>);
