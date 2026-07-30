import type { ReactElement } from "react";

export type IconName =
  | "back"
  | "bookmark"
  | "heart"
  | "mic"
  | "moon"
  | "more"
  | "next"
  | "pause"
  | "play"
  | "previous"
  | "queue"
  | "search"
  | "send"
  | "sun"
  | "volume";

const paths: Record<IconName, ReactElement> = {
  back: <path d="m15 18-6-6 6-6" />,
  bookmark: <path d="M7 4h10v16l-5-3-5 3Z" />,
  heart: <path d="M12 20.4 4.8 13.6A4.9 4.9 0 0 1 12 7a4.9 4.9 0 0 1 7.2 6.6Z" />,
  mic: <path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0Zm-3 6a6 6 0 0 0 12 0M12 17v4m-4 0h8" />,
  moon: <path d="M20 15.2A8.7 8.7 0 0 1 8.8 4 8.7 8.7 0 1 0 20 15.2Z" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  next: <path d="m7 5 9 7-9 7Zm10 0v14" />,
  pause: <path d="M8 5v14m8-14v14" />,
  play: <path d="m8 5 11 7-11 7Z" />,
  previous: <path d="m17 5-9 7 9 7ZM7 5v14" />,
  queue: <path d="M4 7h11M4 12h11M4 17h11m4-10v10l3-2" />,
  search: <path d="m21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />,
  send: <path d="m4 5 16 7-16 7 3-7Zm3 7h13" />,
  sun: (
    <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
  ),
  volume: <path d="M5 10v4h4l5 4V6L9 10Zm12-2a6 6 0 0 1 0 8m2.5-10.5a9 9 0 0 1 0 13" />,
};

export function Icon({ className, name }: { className: string; name: IconName }): ReactElement {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}
