import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CurrentProfileResponse,
  ProfileContext,
  ProfileListResponse,
} from "@koradio/contracts";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { createAudioEngine, type AudioEngineFacade } from "../audio/index.js";
import {
  createServiceTransport,
  resolveApiOrigin,
  type ServiceTransport,
} from "../shared/transport.js";
import { createAppEventBus } from "../shared/events.js";
import { SettingsExperience } from "../features/device-settings/index.js";
import { applyTheme } from "../features/profile-preferences/index.js";
import { getCurrentProfile, getProfiles, ProfileExperience } from "../features/profiles/index.js";
import { ConnectingPage, OfflinePage, OfflineSettingsPage, OnlineShellPage } from "./pages.js";
import { createAppQueryClient, QueryClientProvider } from "./query-client.js";
import { DesktopCanvasGate } from "./desktop-canvas.js";
import { useAppRouter } from "./router.js";
import { useServiceConnection } from "./use-service-connection.js";

interface AppProps {
  audioEngine?: AudioEngineFacade;
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

function AppComposition({
  audioEngine,
  transport,
}: {
  audioEngine: AudioEngineFacade;
  transport: ServiceTransport;
}): ReactElement {
  const [eventBus] = useState(createAppEventBus);
  const { navigate, replace, route } = useAppRouter();
  const connection = useServiceConnection(transport, eventBus.publish);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reconnectingFromOffline = useRef(false);
  const queryClient = useQueryClient();
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [reusedScenario, setReusedScenario] = useState<{
    profileId: string;
    scenarioText: string;
  }>();
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => getProfiles(transport),
    enabled: connection.state === "online" || connection.state === "reconnecting",
  });
  const currentProfile = useQuery({
    queryKey: ["current-profile"],
    queryFn: () => getCurrentProfile(transport),
    enabled: connection.state === "online" || connection.state === "reconnecting",
  });
  const currentTheme = currentProfile.data?.current?.preferences.themeMode;
  const consumeReusedScenario = useCallback((): void => {
    setReusedScenario(undefined);
  }, []);
  const reuseScenario = useCallback(
    (scenarioText: string): boolean => {
      const current = currentProfile.data?.current;
      if (connection.state !== "online" || current === null || current === undefined) return false;
      setReusedScenario({ profileId: current.profile.id, scenarioText });
      navigate("/radio");
      return true;
    },
    [connection.state, currentProfile.data?.current, navigate],
  );

  useEffect(() => {
    if (currentTheme !== undefined) {
      applyTheme(currentTheme);
    }
  }, [currentTheme]);

  useEffect(() => {
    if (connection.state === "offline") {
      reconnectingFromOffline.current = true;
      void audioEngine.prepareForProfileSwitch();
      return;
    }

    if (connection.state === "online" && reconnectingFromOffline.current) {
      reconnectingFromOffline.current = false;
      replace("/radio");
    }
  }, [audioEngine, connection.state, replace]);

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

  if (profiles.isLoading || currentProfile.isLoading) {
    return <ConnectingPage />;
  }

  if (
    profiles.isError ||
    currentProfile.isError ||
    profiles.data === undefined ||
    currentProfile.data === undefined
  ) {
    return (
      <div className="app-surface fatal-error" role="alert">
        <p>PROFILE DATA ERROR</p>
        <h1>本地档案暂时无法读取</h1>
        <button
          className="button button--primary"
          type="button"
          onClick={() => void Promise.all([profiles.refetch(), currentProfile.refetch()])}
        >
          重新读取
        </button>
      </div>
    );
  }

  const setCurrent = (current: ProfileContext): void => {
    setReusedScenario(undefined);
    queryClient.setQueryData<CurrentProfileResponse>(["current-profile"], { current });
    setProfilesOpen(false);
    if (
      currentProfile.data.current === null &&
      connection.health?.providers.codex === "unavailable"
    ) {
      navigate("/settings");
    }
  };

  if (currentProfile.data.current === null || profilesOpen) {
    return (
      <ProfileExperience
        beforeProfileChange={() => audioEngine.prepareForProfileSwitch()}
        current={currentProfile.data.current}
        initialMode={profiles.data.items.length === 0 ? "create" : "select"}
        profiles={profiles.data.items}
        transport={transport}
        onCancel={
          currentProfile.data.current === null
            ? undefined
            : () => {
                setProfilesOpen(false);
              }
        }
        onProfileChanged={setCurrent}
        onProfilesChanged={async () => {
          const result = await profiles.refetch();
          if (result.data !== undefined)
            queryClient.setQueryData<ProfileListResponse>(["profiles"], result.data);
        }}
      />
    );
  }

  if (route.id === "settings") {
    return (
      <SettingsExperience
        current={currentProfile.data.current}
        health={connection.health}
        navigate={navigate}
        onCurrentChanged={setCurrent}
        onOpenProfiles={() => {
          setProfilesOpen(true);
        }}
        reconnecting={connection.state === "reconnecting"}
        transport={transport}
      />
    );
  }

  return (
    <OnlineShellPage
      audioEngine={audioEngine}
      headingRef={headingRef}
      health={connection.health}
      navigate={navigate}
      current={currentProfile.data.current}
      initialRadioScenario={
        reusedScenario?.profileId === currentProfile.data.current.profile.id
          ? reusedScenario.scenarioText
          : undefined
      }
      onCurrentChanged={setCurrent}
      onOpenProfiles={() => {
        setProfilesOpen(true);
      }}
      onRadioScenarioConsumed={consumeReusedScenario}
      onReuseScenario={reuseScenario}
      eventBus={eventBus}
      reconnecting={connection.state === "reconnecting"}
      route={route}
      transport={transport}
    />
  );
}

export function App({ audioEngine, transport }: AppProps): ReactElement {
  const [queryClient] = useState(createAppQueryClient);
  const [serviceTransport] = useState(
    () => transport ?? createServiceTransport(resolveApiOrigin()),
  );
  const [serviceAudioEngine] = useState(
    () => audioEngine ?? createAudioEngine({ transport: serviceTransport }),
  );

  useEffect(
    () => () => {
      void serviceAudioEngine.destroy();
    },
    [serviceAudioEngine],
  );

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <DesktopCanvasGate>
          <AppComposition audioEngine={serviceAudioEngine} transport={serviceTransport} />
        </DesktopCanvasGate>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
