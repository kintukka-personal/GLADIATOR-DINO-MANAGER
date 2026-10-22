/// <reference types="vite/client" />

interface ClaudeHot {
  /** host calls back with the data saved by the previous version of the page */
  ready?: (cb: (data: HotData) => void) => void;
  data?: HotData;
  snapshot?: (fn: () => HotData) => void;
}

interface HotData {
  save?: string;
  meta?: unknown;
}

interface Window {
  claude?: { hot?: ClaudeHot };
}
