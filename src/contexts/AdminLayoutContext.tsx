import { createContext, useContext, ComponentType, ReactNode } from "react";

const LayoutOverrideContext = createContext<ComponentType<{ children: ReactNode }> | null>(null);

export const LayoutOverrideProvider = LayoutOverrideContext.Provider;
export const useLayoutOverride = () => useContext(LayoutOverrideContext);
