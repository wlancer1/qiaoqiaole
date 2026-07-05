export type Cell = {
  x: number;
  y: number;
  color: string;
  transparent?: boolean;
};

export type Settings = {
  cellSize: number;
  wallHeight: number;
  wallThickness: number;
  frameThickness: number;
  baseThickness: number;
  pegDiameter: number;
  pegHeight: number;
};

export type Project = {
  id: string;
  imageUrl: string;
  rows: number;
  cols: number;
  cells: Cell[];
  settings: Settings;
  createdAt: string;
};

export const DEFAULT_SETTINGS: Settings = {
  cellSize: 10,
  wallHeight: 5,
  wallThickness: 1.2,
  baseThickness: 1,
  frameThickness: 2,
  pegDiameter: 8,
  pegHeight: 4,
};
