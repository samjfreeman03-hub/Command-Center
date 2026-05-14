"use client";

import { createContext, useContext } from "react";

export const ShareTokenContext = createContext<string | null>(null);

export function useShareHeaders(): Record<string, string> {
  const token = useContext(ShareTokenContext);
  return token ? { "x-share-token": token } : {};
}
