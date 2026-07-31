// Builds the application state once at the root and hands the same instance to everything below it.
import type { JSX } from "solid-js";
import type { AppStateControls } from "./app-state";
import { createContext, useContext } from "solid-js";
import { createAppState } from "./app-state";

export interface AppStateProviderProps {
  readonly children: JSX.Element;
}

const AppStateContext = createContext<AppStateControls>();

export function AppStateProvider(props: AppStateProviderProps): JSX.Element {
  const controls = createAppState();

  return <AppStateContext.Provider value={controls}>{props.children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateControls {
  const controls = useContext(AppStateContext);
  if (controls === undefined) {
    throw new Error("useAppState called outside an AppStateProvider");
  }
  return controls;
}
