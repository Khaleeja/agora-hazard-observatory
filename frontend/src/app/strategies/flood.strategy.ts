import { GeoJSONFeature } from '../types/GeoJSONFeature';
import { EventTypeStrategy, FilterField } from './event-type.strategy';

const COLOR = '#60A5FA'; // blue

export class FloodStrategy implements EventTypeStrategy {
  readonly name = 'flood';
  readonly label = 'Flood';
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
      return this._renderPolygon(geom.coordinates as number[][][], Cesium, dataSource);
    }

    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _renderPolygon(coordinates: number[][][], Cesium: any, dataSource: any): unknown {
    const color = Cesium.Color.fromCssColorString(COLOR);
    const hierarchy = new Cesium.PolygonHierarchy(
      Cesium.Cartesian3.fromDegreesArray(coordinates[0].flat()),
      coordinates.slice(1).map((r) => new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(r.flat()))),
    );
    return dataSource.entities.add({
      polygon: {
        hierarchy,
        material: color.withAlpha(0.3),
        outline: true,
        outlineColor: color.withAlpha(0.9),
      },
    });
  }
}
