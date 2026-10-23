import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { FilterService } from './filter';

describe('FilterService', () => {
  let service: FilterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FilterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('commitDaily', () => {
    it('sets from/to as ISO 8601 strings', async () => {
      service.commitDaily();
      const params = await firstValueFrom(service.getCommitted());
      expect(params.from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(params.to).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('sets an interval of exactly 24h between from and to', async () => {
      service.commitDaily();
      const params = await firstValueFrom(service.getCommitted());
      const diff = new Date(params.to!).getTime() - new Date(params.from!).getTime();
      expect(diff).toBeCloseTo(86_400_000, -3);
    });
  });

  describe('toggleEventType', () => {
    it('adds a new type when status is true', async () => {
      service.toggleEventType({ name: 'flood', status: true });
      const types = await firstValueFrom(service.getType());
      expect(types).toContain('flood');
    });

    it('removes a type when status is false', async () => {
      service.toggleEventType({ name: 'earthquake', status: false });
      const types = await firstValueFrom(service.getType());
      expect(types).not.toContain('earthquake');
    });

    it('does not add duplicates if type is already active', async () => {
      service.toggleEventType({ name: 'earthquake', status: true });
      const types = await firstValueFrom(service.getType());
      expect(types.filter((t) => t === 'earthquake').length).toBe(1);
    });
  });

  describe('toggleCategory', () => {
    it('adds a category when not yet active', async () => {
      service.toggleCategory('5');
      const categories = await firstValueFrom(service.getCategory());
      expect(categories).toEqual(['5']);
    });

    it('removes a category when already active', async () => {
      service.toggleCategory('5');
      service.toggleCategory('5');
      const categories = await firstValueFrom(service.getCategory());
      expect(categories).toEqual([]);
    });

    it('clearCategory empties the list', async () => {
      service.toggleCategory('TD');
      service.toggleCategory('TS');
      service.clearCategory();
      const categories = await firstValueFrom(service.getCategory());
      expect(categories).toEqual([]);
    });
  });

  describe('commit', () => {
    it('copies draft params into committed', async () => {
      service.updateDraft({ from: '2024-01-01T00:00:00.000Z' });
      service.commit();
      const params = await firstValueFrom(service.getCommitted());
      expect(params.from).toBe('2024-01-01T00:00:00.000Z');
    });
  });
});
