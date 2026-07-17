import type { KeyboardEvent, ReactElement } from "react";
import { useRef } from "react";

import brandMark from "../../../../design/assets/icons/koradio-brand-mark.svg";
import libraryIcon from "../../../../design/assets/icons/tab-library.svg";
import programsIcon from "../../../../design/assets/icons/tab-programs.svg";
import radioIcon from "../../../../design/assets/icons/tab-radio.svg";
import settingsIcon from "../../../../design/assets/icons/tab-settings.svg";
import tasteIcon from "../../../../design/assets/icons/tab-taste.svg";
import { appRoutes, type AppRouteId } from "../app/router.js";

const routeIcons: Record<AppRouteId, string> = {
  library: libraryIcon,
  programs: programsIcon,
  radio: radioIcon,
  settings: settingsIcon,
  taste: tasteIcon,
};

export function Brand(): ReactElement {
  return (
    <span className="brand" aria-label="Koradio">
      <img className="brand__mark" src={brandMark} alt="" />
      <span className="brand__wordmark">KORADIO</span>
    </span>
  );
}

interface PrimaryNavigationProps {
  active: AppRouteId;
  disabled?: boolean;
  onNavigate: (path: string) => void;
}

export function PrimaryNavigation({
  active,
  disabled = false,
  onNavigate,
}: PrimaryNavigationProps): ReactElement {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % appRoutes.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + appRoutes.length) % appRoutes.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = appRoutes.length - 1;
    }

    if (nextIndex !== undefined) {
      event.preventDefault();
      itemRefs.current[nextIndex]?.focus();
    }
  }

  return (
    <nav className="primary-nav" aria-label="主要导航">
      {appRoutes.map((route, index) => {
        const unavailable = disabled && route.id !== "settings";
        const label = unavailable ? `${route.label}，离线不可用` : route.label;
        return (
          <button
            className={`primary-nav__item${route.id === active ? " primary-nav__item--active" : ""}`}
            key={route.id}
            type="button"
            aria-current={route.id === active ? "page" : undefined}
            aria-disabled={unavailable || undefined}
            aria-label={label}
            data-tooltip={route.label}
            onClick={() => {
              if (!unavailable) {
                onNavigate(route.path);
              }
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, index);
            }}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
          >
            <img src={routeIcons[route.id]} alt="" />
          </button>
        );
      })}
    </nav>
  );
}

interface StatusProps {
  children: string;
  tone: "connected" | "offline" | "pending";
}

export function Status({ children, tone }: StatusProps): ReactElement {
  return (
    <span className={`status status--${tone}`}>
      <span className="status__dot" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
