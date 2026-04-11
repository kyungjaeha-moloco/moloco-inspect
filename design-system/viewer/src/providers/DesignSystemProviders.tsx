import React from 'react';
import i18n from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { ThemeProvider } from 'styled-components';
import { createTheme } from '@moloco/moloco-cloud-react-ui';

import en from '@msm-portal/i18n/assets/en/sot-resource.json';

// Minimal i18n for the viewer (same as Storybook preview.tsx)
const i18nInstance = i18n.createInstance();
i18nInstance.use(initReactI18next).init({
  lng: 'en',
  ns: ['common'],
  defaultNS: 'common',
  resources: { en },
  interpolation: { escapeValue: false },
});

const theme = createTheme(undefined);

export function DesignSystemProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nextProvider i18n={i18nInstance}>
      <ThemeProvider theme={theme}>
        {children}
      </ThemeProvider>
    </I18nextProvider>
  );
}
