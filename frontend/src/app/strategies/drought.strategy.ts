import { GeoJSONFeature } from '../types/GeoJSONFeature';
import { EventTypeStrategy, FilterField } from './event-type.strategy';

const COLOR = '#FBBF24'; // amber

export class DroughtStrategy implements EventTypeStrategy {
  readonly name = 'drought';
  readonly label = 'Drought';
  readonly filterFields: ReadonlySet<FilterField> = new Set(['position']);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderOnMap(feature: GeoJSONFeature, Cesium: any, dataSource: any, getPin: (f: GeoJSONFeature) => string): unknown {
    const geom = feature.geometry;

    if (geom.type === 'Point') {
      const [lon, lat] = geom.coordinates as number[];
      return dataSource.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        billboard: { image: getPin(feature), verticalOrigin: Cesium.VerticalOrigin.BOTTOM },
      });
    }

    if (geom.type === 'Polygon') {
      const color = Cesium.Color.fromCssColorString(COLOR);
      const coords = geom.coordinates as number[][][];
      const hierarchy = new Cesium.PolygonHierarchy(
        Cesium.Cartesian3.fromDegreesArray(coords[0].flat()),
        coords.slice(1).map((r) => new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(r.flat()))),
      );
      return dataSource.entities.add({
        polygon: {
          hierarchy,
          material: color.withAlpha(0.25),
          outline: true,
          outlineColor: color.withAlpha(0.85),
        },
      });
    }

    return null;
  }
}
