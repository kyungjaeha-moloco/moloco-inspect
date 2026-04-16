import type React from 'react';
import { ButtonPreview } from '@ds-previews/ButtonPreview';
import { TextInputPreview } from '@ds-previews/TextInputPreview';
import { TextAreaPreview } from '@ds-previews/TextAreaPreview';
import { NumberInputPreview } from '@ds-previews/NumberInputPreview';
import { CheckBoxPreview } from '@ds-previews/CheckBoxPreview';
import { SwitchPreview } from '@ds-previews/SwitchPreview';
import { RadioPreview } from '@ds-previews/RadioPreview';
import { TabsPreview } from '@ds-previews/TabsPreview';
import { AccordionPreview } from '@ds-previews/AccordionPreview';
import { DialogPreview } from '@ds-previews/DialogPreview';
import { SelectPreview } from '@ds-previews/SelectPreview';
import { SearchBarPreview } from '@ds-previews/SearchBarPreview';
import { StatusPreview } from '@ds-previews/StatusPreview';
import { BannerPreview } from '@ds-previews/BannerPreview';
import { LoaderPreview } from '@ds-previews/LoaderPreview';

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
