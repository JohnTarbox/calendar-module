import type { Preview } from '@storybook/react';
import '@johntarbox/calendar-react/styles';

const preview: Preview = {
  parameters: {
    controls: { matchers: { date: /Date$/i } },
  },
};

export default preview;
