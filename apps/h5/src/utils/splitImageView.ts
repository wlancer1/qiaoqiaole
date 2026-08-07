export type SplitImageView = {
  scale: number;
  offset: { x: number; y: number };
};

export function defaultSplitImageView(): SplitImageView {
  return { scale: 1, offset: { x: 0, y: 0 } };
}
