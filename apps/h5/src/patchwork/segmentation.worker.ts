/// <reference lib="webworker" />
import { analyzeSegments, type SegmentRequest } from './segmentation';

/** 图片识别在 Worker 内执行，避免卡住手机端画布。 */
self.onmessage = (event: MessageEvent<SegmentRequest>) => {
  const requestId = event.data.requestId;
  try {
    self.postMessage(analyzeSegments(event.data));
  } catch (error) {
    self.postMessage({ requestId, polygons: [], ignored: 0, tooMany: false, error: error instanceof Error ? error.message : '图片识别失败' });
  }
};
export {};
