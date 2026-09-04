import { createContext, useContext } from "react";

export const AuthClientResetContext = createContext<() => void>(() => {});

export function useAuthClientReset(): () => void {
  return useContext(AuthClientResetContext);
}