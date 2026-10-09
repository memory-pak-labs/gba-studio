import React from "react";

import { StudioI18nProvider } from "./i18n";
import { StudioDialogProvider } from "./studioDialog";
import { StudioToastProvider } from "./studioToast";

export function StudioProviders({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <StudioI18nProvider>
      <StudioDialogProvider>
        <StudioToastProvider>
          {children}
        </StudioToastProvider>
      </StudioDialogProvider>
    </StudioI18nProvider>
  );
}
