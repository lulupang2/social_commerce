import { mainMessages } from './main-messages';
import { commerceMessages } from './commerce-messages';
import { socialMessages } from './social-messages';
import { sellMessages } from './sell-messages';
import { serviceMessages } from './service-messages';
import { previewMessages } from './preview-messages';

export const englishMessages: Record<string, string> = {
  ...previewMessages,
  ...serviceMessages,
  ...commerceMessages,
  ...socialMessages,
  ...sellMessages,
  ...mainMessages,
};
