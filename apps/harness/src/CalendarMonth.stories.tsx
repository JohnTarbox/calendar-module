import type { Meta, StoryObj } from '@storybook/react';
import { CalendarMonth } from '@jonnyboats/calendar-react';
import { config, events, NOW, overflowEvents } from './fixtures.js';

const meta: Meta<typeof CalendarMonth> = {
  title: 'Calendar/Month',
  component: CalendarMonth,
  args: { config, now: NOW },
};
export default meta;

type Story = StoryObj<typeof CalendarMonth>;

/** The v0 visual baseline: ribbons, an ongoing strip, a timed event, and the today disc. */
export const Default: Story = {
  args: { events },
};

export const Overflow: Story = {
  args: { events: overflowEvents },
};

export const EmptyWindow: Story = {
  args: { events: [] },
};

export const Loading: Story = {
  args: { events, status: 'loading' },
};

export const FetchError: Story = {
  args: { events, status: 'error' },
};
