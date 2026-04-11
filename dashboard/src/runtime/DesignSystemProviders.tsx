import React from 'react';
import i18n from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { ThemeProvider } from 'styled-components';
import { createTheme } from '@moloco/moloco-cloud-react-ui';

import MCGlobalStyle from '@msm-portal/builder/styles/MCGlobalStyle';
import en from '@msm-portal/i18n/assets/en/sot-resource.json';

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
        <MCGlobalStyle />
        {children}
      </ThemeProvider>
    </I18nextProvider>
  );
}
