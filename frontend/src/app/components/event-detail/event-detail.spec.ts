import { render, screen } from '@testing-library/angular';
import { EventDetail } from './event-detail';
import { GeoJSONFeature } from '../../types/GeoJSONFeature';

const mockEvent = (overrides: Partial<GeoJSONFeature['properties']> = {}): GeoJSONFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [12.4964, 41.9028] },
  properties: {
    id: 'test-1',
    title: 'M 4.2 - Central Italy',
    eventType: 'earthquake',
    source: 'usgs',
    severity: 'Medium',
    timestamp: Date.now() - 1_800_000,
    location: 'Central Italy',
    magnitude: 4.2,
    ...overrides,
  },
});

describe('EventDetail', () => {
  it('renders the event location', async () => {
    await render(EventDetail, { componentInputs: { event: mockEvent() } });
    expect(screen.getByText('Central Italy')).toBeTruthy();
  });

  it('shows the magnitude badge when magnitude is present', async () => {
    await render(EventDetail, { componentInputs: { event: mockEvent({ magnitude: 4.2 }) } });
    expect(screen.getByText('4.20')).toBeTruthy();
  });

  it('hides the magnitude badge when magnitude is absent', async () => {
    await render(EventDetail, {
      componentInputs: { event: mockEvent({ magnitude: undefined }) },
    });
    expect(screen.queryByText('MAG')).toBeNull();
  });

  it('shows time as "X mins ago" for recent events', async () => {
    await render(EventDetail, {
      componentInputs: { event: mockEvent({ timestamp: Date.now() - 1_800_000 }) },
    });
    expect(screen.getByText(/mins ago/)).toBeTruthy();
  });

  it('shows time as "X hours ago" for events within 7 hours', async () => {
    await render(EventDetail, {
      componentInputs: { event: mockEvent({ timestamp: Date.now() - 10_800_000 }) },
    });
    expect(screen.getByText(/hours ago/)).toBeTruthy();
  });
});

const mockCyclone = (): GeoJSONFeature => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [
      [80, 10],
      [81, 11],
    ],
  },
  properties: {
    id: 'cyclone-1',
    title: 'TEST (2024)',
    eventType: 'cyclone',
    source: 'IBTrACS',
    severity: 'Medium',
    timestamp: 2000,
    location: 'North Indian',
    category: '2',
    track: [
      { timestamp: 1000, windSpeed: 40, pressure: 995 },
      { timestamp: 2000, windSpeed: 60, pressure: 985 },
    ],
  },
});

describe('EventDetail — cyclone card', () => {
  it('shows the category badge instead of a magnitude badge', async () => {
    await render(EventDetail, { componentInputs: { event: mockCyclone(), asOf: 2000 } });
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('CAT')).toBeTruthy();
    expect(screen.queryByText('MAG')).toBeNull();
  });

  it('shows wind/pressure resolved as of the given asOf, not the absolute latest', async () => {
    await render(EventDetail, { componentInputs: { event: mockCyclone(), asOf: 1000 } });
    expect(screen.getByText(/40 kt/)).toBeTruthy();
    expect(screen.queryByText(/60 kt/)).toBeNull();
  });
});
