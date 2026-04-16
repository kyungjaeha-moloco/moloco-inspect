import React from 'react';
import {
  ButtonPreview,
  TextInputPreview,
  TextAreaPreview,
  NumberInputPreview,
  CheckBoxPreview,
  SwitchPreview,
  RadioPreview,
  TabsPreview,
  AccordionPreview,
  DialogPreview,
  SelectPreview,
  SearchBarPreview,
  StatusPreview,
  BannerPreview,
  LoaderPreview,
} from '@ds-previews/index';

type PreviewRenderer = React.ComponentType<{ propValues?: Record<string, any> }>;

export const PREVIEW_REGISTRY: Record<string, PreviewRenderer> = {
  MCButton2: ButtonPreview,
  MCFormTextInput: TextInputPreview,
  MCFormTextArea: TextAreaPreview,
  MCFormNumberInput: NumberInputPreview,
  MCFormCheckBox: CheckBoxPreview,
  MCFormSwitchInput: SwitchPreview,
  MCFormRadioGroup: RadioPreview,
  MCBarTabs: TabsPreview,
  MCAccordion: AccordionPreview,
  MCCommonDialog: DialogPreview,
  MCFormSingleRichSelect: SelectPreview,
  MCSearchBar: SearchBarPreview,
  MCStatus: StatusPreview,
  MCBanner: BannerPreview,
  MCCircularLoader: LoaderPreview,
};

export function hasPreview(type: string): boolean {
  return type in PREVIEW_REGISTRY;
}
