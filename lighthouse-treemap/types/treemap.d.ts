import _Util = require('../app/src/util.js');
import {RootNode as _RootNode} from '../../lighthouse-core/audits/treemap-data';
import {Node as _Node} from '../../lighthouse-core/audits/treemap-data';
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

    type RootNode = _RootNode;
    type Node2 = _Node;
  }

  interface TreeMap {
    new (data: any, styles: Record<string, any>): TreeMap;
    render(el: HTMLElement): void;
  }

  var webtreemap: {TreeMap: TreeMap};
  var Util: typeof _Util;

  interface Window {
    __treemapViewer: TreemapViewer;
    __TREEMAP_OPTIONS?: Treemap.Options;
  }
}

export {};
