import { GeoJSONFeature } from '../types/GeoJSONFeature';
import { EventTypeStrategy, FilterField } from './event-type.strategy';

export class VolcanoStrategy implements EventTypeStrategy {
  readonly name = 'volcano';
  readonly label = 'Volcano';
  readonly filterFields: ReadonlySet<FilterField> = new Set(['magnitude', 'position']);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderOnMap(feature: GeoJSONFeature, Cesium: any, dataSource: any, getPin: (f: GeoJSONFeature) => string): unknown {
    if (feature.geometry.type !== 'Point') return null;
    const [lon, lat] = feature.geometry.coordinates as number[];
    return dataSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      billboard: { image: getPin(feature), verticalOrigin: Cesium.VerticalOrigin.BOTTOM },
    });
  }
}
