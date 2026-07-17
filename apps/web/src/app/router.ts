import { useCallback, useEffect, useState } from "react";

export const appRoutes = [
  { id: "radio", label: "Radio", path: "/radio" },
  { id: "library", label: "Library", path: "/library" },
  { id: "taste", label: "Taste", path: "/taste" },
  { id: "programs", label: "Programs", path: "/programs" },
  { id: "settings", label: "Settings", path: "/settings" },
] as const;

export type AppRoute = (typeof appRoutes)[number];
export type AppRouteId = AppRoute["id"];

export function resolveAppRoute(pathname: string): AppRoute {
  return appRoutes.find((route) => route.path === pathname) ?? appRoutes[0];
}

function writeRoute(path: string, mode: "push" | "replace"): void {
  if (mode === "replace") {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useAppRouter(): {
  navigate: (path: string) => void;
  replace: (path: string) => void;
  route: AppRoute;
} {
  const [route, setRoute] = useState(() => resolveAppRoute(window.location.pathname));

  useEffect(() => {
    if (
      window.location.pathname === "/" ||
      resolveAppRoute(window.location.pathname).path !== window.location.pathname
    ) {
      writeRoute(route.path, "replace");
    }

    const updateRoute = (): void => {
      setRoute(resolveAppRoute(window.location.pathname));
    };
    window.addEventListener("popstate", updateRoute);
    return () => {
      window.removeEventListener("popstate", updateRoute);
    };
  }, [route.path]);

  return {
    navigate: useCallback((path: string) => {
      writeRoute(resolveAppRoute(path).path, "push");
    }, []),
    replace: useCallback((path: string) => {
      writeRoute(resolveAppRoute(path).path, "replace");
    }, []),
    route,
  };
}
