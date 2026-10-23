type PointCoordinates = [number, number, number?];
type LineStringCoordinates = PointCoordinates[];
type PolygonCoordinates = LineStringCoordinates[];

export type GeoJSONGeometry =
  | { type: "Point"; coordinates: PointCoordinates }
  | { type: "LineString"; coordinates: LineStringCoordinates }
  | { type: "Polygon"; coordinates: PolygonCoordinates };
