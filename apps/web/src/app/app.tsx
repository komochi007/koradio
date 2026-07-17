import { QueryClientProvider } from "@tanstack/react-query";
import { Component, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

import {
  createServiceTransport,
  resolveApiOrigin,
  type ServiceTransport,
} from "../shared/transport.js";
import { ConnectingPage, OfflinePage, OfflineSettingsPage, OnlineShellPage } from "./pages.js";
import { createAppQueryClient } from "./query-client.js";
import { useAppRouter } from "./router.js";
import { useServiceConnection } from "./use-service-connection.js";

interface AppProps {
  transport?: ServiceTransport;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="fatal-error" role="alert">
          <p>APP SHELL ERROR</p>
          <h1>Koradio 暂时无法显示</h1>
          <button
            className="button button--primary"
            type="button"
            onClick={() => {
              window.location.reload();
            }}
          >
            重新载入
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}

function AppComposition({ transport }: { transport: ServiceTransport }): ReactElement {
  const { navigate, replace, route } = useAppRouter();
  const connection = useServiceConnection(transport);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reconnectingFromOffline = useRef(false);

  useEffect(() => {
    if (connection.state === "offline") {
      reconnectingFromOffline.current = true;
      return;
    }

    if (connection.state === "online" && reconnectingFromOffline.current) {
      reconnectingFromOffline.current = false;
      replace("/radio");
    }
  }, [connection.state, replace]);

  useEffect(() => {
    if (connection.state === "online" || connection.state === "reconnecting") {
      headingRef.current?.focus();
    }
  }, [connection.state, route.path]);

  if (connection.state === "connecting") {
    return <ConnectingPage />;
  }

  if (connection.state === "offline") {
    return route.id === "settings" ? (
      <OfflineSettingsPage navigate={navigate} reconnect={connection.reconnect} />
    ) : (
      <OfflinePage navigate={navigate} reconnect={connection.reconnect} />
    );
  }

  if (connection.health === undefined) {
    return <ConnectingPage />;
  }

  return (
    <OnlineShellPage
      headingRef={headingRef}
      health={connection.health}
      navigate={navigate}
      reconnecting={connection.state === "reconnecting"}
      route={route}
    />
  );
}

export function App({ transport }: AppProps): ReactElement {
  const [queryClient] = useState(createAppQueryClient);
  const [serviceTransport] = useState(
    () => transport ?? createServiceTransport(resolveApiOrigin()),
  );

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppComposition transport={serviceTransport} />
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
