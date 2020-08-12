declare global {
  module Treemap {
    interface Options {
      lhr: LH.Result;
      showViewId: string;
    }

    interface Mode {
      rootNodeId: string;
      partitionBy: string;
      highlightNodeIds?: string[];
    }
  }

  interface Window {
    __treemapViewer: TreemapViewer;
    __TREEMAP_OPTIONS?: Treemap.Options;
  }
}

export {};
