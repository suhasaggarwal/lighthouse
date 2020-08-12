import _Util = require('../app/src/utils.js');
import '../../types/lhr';

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

  var Util: typeof _Util;

  interface Window {
    __treemapViewer: TreemapViewer;
    __TREEMAP_OPTIONS?: Treemap.Options;
  }
}

export {};
