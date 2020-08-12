/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/** @typedef {import('../../../lighthouse-core/audits/treemap-data.js').RootNode} RootNode */
/** @typedef {import('../../../lighthouse-core/audits/treemap-data.js').Node} Node2 */

const KB = 1024;
const MB = KB * KB;

/** @type {TreemapViewer} */
let treemapViewer;

// From DevTools:
// https://cs.chromium.org/chromium/src/third_party/devtools-frontend/src/front_end/quick_open/CommandMenu.js?l=255&rcl=ad5c586c30a6bc55962b7a96b0533911c86bd4fc
const COLOR_HUES = [
  '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#03A9F4',
  '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFC107',
  '#FF9800', '#FF5722', '#795548', '#9E9E9E', '#607D8B',
].map(hex => {
  const hexParts = hex.slice(1).split(/(..)/).filter(Boolean);
  const rgb = hexParts.map(part => parseInt(part, 16));
  return rgb2hue(...rgb);
});

/**
 * @template T
 * @param {T[]} items
 * @return {T|null}
 */
function stableHasher(items) {
  // Clone.
  items = [...items];

  const assignedItems = {};
  return hash => {
    if (hash in assignedItems) return assignedItems[hash];
    if (items.length === 0) return null;
    const [assignedColor] = items.splice(hash % items.length, 1);
    assignedItems[hash] = assignedColor;
    return assignedColor;
  };
}

/**
 * Brilliant code by akinuri
 * https://stackoverflow.com/a/39147465
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
function rgb2hue(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const c = max - min;
  let hue;
  if (c == 0) {
    hue = 0;
  } else {
    switch (max) {
      case r:
        var segment = (g - b) / c;
        var shift = 0 / 60; // R° / (360° / hex sides)
        if (segment < 0) { // hue > 180, full rotation
          shift = 360 / 60; // R° / (360° / hex sides)
        }
        hue = segment + shift;
        break;
      case g:
        var segment = (b - r) / c;
        var shift = 120 / 60; // G° / (360° / hex sides)
        hue = segment + shift;
        break;
      case b:
        var segment = (r - g) / c;
        var shift = 240 / 60; // B° / (360° / hex sides)
        hue = segment + shift;
        break;
    }
  }
  return hue * 60; // hue is in [0,6], scale it up
}

/**
 * @param {number} bytes
 */
function formatBytes(bytes) {
  if (bytes >= MB) return (bytes / MB).toFixed(2) + ' MB';
  if (bytes >= KB) return (bytes / KB).toFixed(2) + ' KB';
  return bytes + ' B';
}

/**
 * @param {number} value
 * @param {string} unit
 */
function format(value, unit) {
  if (unit === 'bytes') return formatBytes(value);
  if (unit === 'time') return `${value} ms`;
  return `${value} ${unit}`;
}

/**
 * Guaranteed context.querySelector. Always returns an element or throws if
 * nothing matches query.
 * @param {string} query
 * @param {ParentNode=} context
 * @return {HTMLElement}
 */
function find(query, context = document) {
  /** @type {?HTMLElement} */
  const result = context.querySelector(query);
  if (result === null) {
    throw new Error(`query ${query} not found`);
  }
  return result;
}

/**
 *
 * @param {Node2} node
 * @param {(node: Node2, fullId: string) => void} fn
 */
function dfs(node, fn, fullId = '') {
  fullId = fullId ? `${fullId}/${node.id}` : node.id;
  fn(node, fullId);
  if (node.children) {
    for (const child of node.children) {
      dfs(child, fn, fullId);
    }
  }
}

function hsl(h, s, l) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * @param {string} string
 * @param {number} length
 */
function elide(string, length) {
  if (string.length <= length) return string;
  return string.slice(0, length) + '…';
}

function sortByPrecedence(precedence, a, b) {
  const aIndex = precedence.indexOf(a);
  const bIndex = precedence.indexOf(b);

  // If neither value has a title with a predefined order, use an alphabetical comparison.
  if (aIndex === -1 && bIndex === -1) {
    return a.localeCompare(b);
  }

  // If just one value has a title with a predefined order, it is greater.
  if (aIndex === -1 && bIndex >= 0) {
    return 1;
  }
  if (bIndex === -1 && aIndex >= 0) {
    return -1;
  }

  // Both values have a title with a predefined order, so do a simple comparison.
  return aIndex - bIndex;
}

class TreemapViewer {
  /**
   * @param {Treemap.Options} options
   * @param {HTMLElement} el
   */
  constructor(options, el) {
    const treemapData = /** @type {LH.Audit.Details.DebugData} */ (
      options.lhr.audits['treemap-data'].details);
    if (!treemapData || !treemapData.rootNodes) throw new Error('missing treemap-data');
    /** @type {RootNode[]} */
    const rootNodes = treemapData.rootNodes;

    for (const rootNode of rootNodes) {
      // TODO: remove.
      dfs(rootNode.node, node => node.originalId = node.id);
      const idHash = [...rootNode.id].reduce((acc, char) => acc + char.charCodeAt(0), 0);
      dfs(rootNode.node, node => node.idHash = idHash);
    }

    this.documentUrl = options.lhr.requestedUrl;
    this.rootNodes = rootNodes;
    this.el = el;
    this.currentRootNode = null;
    this.getHue = stableHasher(COLOR_HUES);
    this.currentViewId = options.showViewId;
  }

  initListeners() {
    window.addEventListener('resize', () => {
      this.render();
    });

    window.addEventListener('click', (e) => {
      const nodeEl = e.target.closest('.webtreemap-node');
      if (!nodeEl) return;
      this.updateColors();
    });

    window.addEventListener('mouseover', (e) => {
      const nodeEl = e.target.closest('.webtreemap-node');
      if (!nodeEl) return;
      nodeEl.classList.add('webtreemap-node--hover');
    });

    window.addEventListener('mouseout', (e) => {
      const nodeEl = e.target.closest('.webtreemap-node'); COLOR_HUES;
      if (!nodeEl) return;
      nodeEl.classList.remove('webtreemap-node--hover');
    });
  }

  /**
   * @param {Treemap.Mode} mode
   */
  show(mode) {
    this.mode = mode;

    // Update options view.
    const partitionBySelectorEl = find('.partition-selector');
    partitionBySelectorEl.value = mode.partitionBy;

    if (mode.rootNodeId === 'javascript') {
      const rootNodes = this.rootNodes
        .filter(rootNode => rootNode.group === mode.rootNodeId);

      const children = rootNodes.map(rootNode => {
        // Wrap with the id of the rootNode. Only for bundles.
        if (rootNode.node.children) {
          return {
            originalId: rootNode.id,
            idHash: rootNode.node.idHash,
            children: [rootNode.node],
            bytes: rootNode.node.bytes,
            wastedBytes: rootNode.node.wastedBytes,
            executionTime: rootNode.node.executionTime,
          };
        }

        return rootNode.node;
      });

      this.currentRootNode = {
        originalId: this.documentUrl,
        bytes: children.reduce((acc, cur) => cur.bytes + acc, 0),
        wastedBytes: children.reduce((acc, cur) => cur.wastedBytes + acc, 0),
        executionTime: children.reduce((acc, cur) => (cur.executionTime || 0) + acc, 0),
        children,
      };
      createViewModes(rootNodes, this.currentViewId);
      this.createTable(rootNodes);
    } else {
      const rootNode = this.rootNodes.find(rootNode => rootNode.id === mode.rootNodeId);
      this.currentRootNode = rootNode.node;
      createViewModes([rootNode], this.currentViewId);
      this.createTable([rootNode]);
    }

    // Clone because data is modified.
    this.currentRootNode = JSON.parse(JSON.stringify(this.currentRootNode));

    dfs(this.currentRootNode, node => {
      node.size = node[mode.partitionBy];
    });
    webtreemap.sort(this.currentRootNode);

    this.setTitle(this.currentRootNode);
    this.el.innerHTML = '';
    this.treemap = new webtreemap.TreeMap(this.currentRootNode, {padding: [18, 3, 3, 3]});
    this.render();
  }

  render() {
    this.treemap.render(this.el);
    this.updateColors();
  }

  /**
   * DFS to generate each treemap node's text.
   * @param {any} node
   */
  setTitle(node) {
    const total = this.currentRootNode[this.mode.partitionBy];
    const sections = [
      {
        calculate: node => elide(node.originalId, 60),
      },
      {
        label: this.mode.partitionBy,
        calculate: node => {
          const unit = this.mode.partitionBy === 'executionTime' ? 'time' : 'bytes';
          const value = node[this.mode.partitionBy];
          return `${format(value, unit)} (${Math.round(value / total * 100)}%)`;
        },
      },
    ];

    dfs(node, node => {
      // const {bytes, wastedBytes, executionTime} = node;
      // TODO: this is from pauls code
      // node.id += ` • ${Number.bytesToString(bytes)} • ${Common.UIString('%.1f\xa0%%', bytes / total * 100)}`;

      node.id = sections.map(section => {
        // Only print the label for the root node.
        if (node === this.currentRootNode && section.label) {
          return `${section.label}: ${section.calculate(node)}`;
        } else {
          return section.calculate(node);
        }
      }).join(' • ');

      // const title = elide(node.originalId, 60);
      // const value = node[this.mode.partitionBy];
      // const unit = this.mode.partitionBy === 'executionTime' ? 'time' : 'bytes';
      // // node.id = `${elide(node.originalId, 60)} • ${formatBytes(bytes)} • ${Math.round(bytes / total * 100)}%`;
      // node.id = `${title} • ${format(value, unit)} ${this.mode.partitionBy} (${Math.round(value / total * 100)}%)`;


      // if (this.mode.partitionBy === 'bytes') {
      //   const total = this.currentRootNode.bytes;
      //   node.id = `${elide(node.originalId, 60)} • ${formatBytes(bytes)} • ${Math.round(bytes / total * 100)}%`;
      // } else if (this.mode.partitionBy === 'wastedBytes') {
      //   // node.id = `${elide(node.originalId, 60)} • ${formatBytes(wastedBytes)} wasted • ${Math.round((1 - wastedBytes / bytes) * 100)}% usage`;
      //   node.id = `${elide(node.originalId, 60)} • ${formatBytes(wastedBytes)} wasted • ${Math.round(wastedBytes / this.currentRootNode.wastedBytes * 100)}%`;
      // } else if (this.mode.partitionBy === 'executionTime' && executionTime !== undefined) {
      //   node.id = `${elide(node.originalId, 60)} • ${Math.round(executionTime)} ms • ${Math.round(executionTime / this.currentRootNode.executionTime * 100)}%`;
      // } else {
      //   node.id = elide(node.originalId, 60);
      // }
    });
  }

  updateColors() {
    dfs(this.currentRootNode, node => {
      if (!node.dom) return;

      // A view can set nodes to highlight. Don't color anything else.
      if (this.mode.highlightNodeIds) {
        if (this.mode.highlightNodeIds.includes(node.originalId)) {
          // TODO: 'ids' are just filenames, which aren't unique.
          node.dom.style.backgroundColor = 'yellow';
        }
        return;
      }

      // Choose color based on id hash so colors are stable across runs.
      const hue = this.getHue(node.idHash);
      if (hue === null) return;

      const sat = 60;
      const lum = 90;

      node.dom.style.backgroundColor = hsl(hue, sat, Math.round(lum));
      node.dom.style.color = lum > 50 ? 'black' : 'white';
    });
  }

  /**
   * @param {RootNode[]} rootNodes
   */
  createTable(rootNodes) {
    const gridPanelEl = find('.panel--datagrid');

    gridPanelEl.innerHTML = '';

    const data = [];
    let maxSize = 0;
    let maxWastedBytes = 0;
    for (const rootNode of rootNodes) {
      const node = rootNode.node;
      // if (node.children) node = node.children[0];

      dfs(node, (node, fullId) => {
        if (node.children) return;

        if (node.bytes) maxSize = Math.max(maxSize, node.bytes);
        if (node.wastedBytes) maxWastedBytes = Math.max(maxWastedBytes, node.wastedBytes);

        data.push({
          name: fullId,
          bytes: node.bytes,
          wastedBytes: node.wastedBytes,
        });
      });
    }

    const gridEl = document.createElement('div');
    gridPanelEl.append(gridEl);
    const table = new Tabulator(gridEl, {
      data, // load row data from array
      height: '100%',
      layout: 'fitColumns', // fit columns to width of table
      tooltips: true, // show tool tips on cells
      addRowPos: 'top', // when adding a new row, add it to the top of the table
      history: true, // allow undo and redo actions on the table
      resizableRows: true, // allow row order to be changed
      initialSort: [ // set the initial sort order of the data
        {column: 'bytes', dir: 'desc'},
      ],
      columns: [ // define the table columns
        {title: 'Name', field: 'name'},
        {title: 'Size', field: 'bytes', align: 'left', formatter: cell => formatBytes(cell.getValue())},
        {title: 'Size', field: 'bytes', formatter: 'progress', formatterParams: {min: 0, max: maxSize, width: '25%'}},
        {title: 'Unused Bytes', field: 'wastedBytes', align: 'left', formatter: cell => formatBytes(cell.getValue())},
        {title: 'Unused Bytes', field: 'wastedBytes', formatter: 'progress', formatterParams: {min: 0, max: maxWastedBytes, width: '25%'}},
      ],
    });
  }

  toggleTable() {
    const mainEl = find('main');
    mainEl.addEventListener('animationstart', () => {
      console.log('Animation started');
    });
    mainEl.classList.toggle('lh-main__show-table');
    treemapViewer && treemapViewer.render();
  }
}

/**
 * @param {Treemap.Options} options
 */
function createHeader(options) {
  const bundleSelectorEl = find('.bundle-selector');
  const partitionBySelectorEl = find('.partition-selector');
  const toggleTableBtn = find('.lh-button--toggle-table');

  bundleSelectorEl.innerHTML = '';

  function makeOption(value, text) {
    const optionEl = document.createElement('option');
    optionEl.value = value;
    optionEl.innerText = text;
    bundleSelectorEl.append(optionEl);
  }

  function onChange() {
    treemapViewer.show({
      ...treemapViewer.mode,
      rootNodeId: bundleSelectorEl.value,
      partitionBy: partitionBySelectorEl.value,
    });
  }

  /** @type {Map<string, RootNode[]>} */
  const nodesByGroup = new Map();
  for (const rootNode of options.rootNodes) {
    const nodes = nodesByGroup.get(rootNode.group) || [];
    nodes.push(rootNode);
    nodesByGroup.set(rootNode.group, nodes);
  }

  const groups = [...nodesByGroup.keys()]
    .sort((a, b) => sortByPrecedence(['javascript'], a, b));
  for (const group of groups) {
    const rootNodes = nodesByGroup.get(group);
    const aggregateNodes = rootNodes.length > 1 && group !== 'misc';

    if (aggregateNodes) {
      makeOption(group, `All ${group}`);
    }

    for (const rootNode of rootNodes) {
      if (!rootNode.node.children) continue; // Only add bundles.
      const title = (aggregateNodes ? '- ' : '') + elide(rootNode.id, 80);
      makeOption(rootNode.id, title);
    }
  }

  bundleSelectorEl.value = options.id;
  bundleSelectorEl.addEventListener('change', onChange);
  partitionBySelectorEl.addEventListener('change', onChange);
  toggleTableBtn.addEventListener('click', () => treemapViewer.toggleTable());
}

/**
 * @param {RootNode[]} rootNodes
 * @param {string=} currentViewId
 */
function createViewModes(rootNodes, currentViewId) {
  const javascriptRootNodes = rootNodes.filter(n => n.group === 'javascript');

  const viewModesPanel = find('.panel--modals');
  /**
   * @param {string} viewId
   * @param {string} name
   * @param {Partial<Mode>} modeOptions
   */
  function makeViewMode(viewId, name, modeOptions) {
    const isCurrentView = viewId === currentViewId;
    const viewModeEl = document.createElement('div');
    viewModeEl.classList.add('view-mode');
    if (isCurrentView) viewModeEl.classList.add('view-mode--active');
    viewModeEl.innerText = name;
    viewModeEl.addEventListener('click', () => {
      if (isCurrentView) {
        // Unselect.
        treemapViewer.currentViewId = null;
        treemapViewer.show({
          ...treemapViewer.mode,
          partitionBy: 'bytes',
          highlightNodeIds: undefined,
        });
        return;
      }

      treemapViewer.currentViewId = viewId;
      treemapViewer.show({
        ...treemapViewer.mode,
        ...modeOptions,
      });
    });

    viewModesPanel.append(viewModeEl);
  }

  // TODO: Sort by savings?

  viewModesPanel.innerHTML = '';

  {
    let bytes = 0;
    for (const rootNode of javascriptRootNodes) {
      dfs(rootNode.node, node => {
        if (node.children) return; // Only consider leaf nodes.
        bytes += node.bytes;
      });
    }
    makeViewMode('all', `All (${formatBytes(bytes)})`, {
      partitionBy: 'bytes',
    });
  }

  {
    let bytes = 0;
    /** @type {string[]} */
    const highlightNodeIds = [];
    for (const rootNode of javascriptRootNodes) {
      dfs(rootNode.node, node => {
        if (node.children) return; // Only consider leaf nodes.
        if (node.wastedBytes < 50 * 1024) return;
        bytes += node.wastedBytes;
        highlightNodeIds.push(node.id);
      });
    }
    makeViewMode('unused', `Unused JS (${formatBytes(bytes)})`, {
      partitionBy: 'wastedBytes',
      highlightNodeIds,
    });
  }

  {
    let bytes = 0;
    /** @type {string[]} */
    const highlightNodeIds = [];
    for (const rootNode of javascriptRootNodes) {
      if (!rootNode.node.children) continue; // Only consider bundles.

      dfs(rootNode.node, node => {
        if (node.children) return; // Only consider leaf nodes.
        if (node.bytes < 200 * 1024) return;
        bytes += node.bytes;
        highlightNodeIds.push(node.id);
      });
    }
    makeViewMode('large', `Large Modules (${formatBytes(bytes)})`, {
      partitionBy: 'bytes',
      highlightNodeIds,
    });
  }

  {
    let bytes = 0;
    /** @type {string[]} */
    const highlightNodeIds = [];
    for (const rootNode of javascriptRootNodes) {
      if (!rootNode.node.children) continue; // Only consider bundles.

      dfs(rootNode.node, node => {
        if (node.children) return; // Only consider leaf nodes.
        if (!node.duplicate) return;
        bytes += node.bytes / 2;
        highlightNodeIds.push(node.id);
      });
    }
    makeViewMode('duplicate', `Duplicate Modules (${formatBytes(bytes)})`, {
      partitionBy: 'bytes',
      highlightNodeIds,
    });
  }
}


/**
 * @param {Treemap.Options} options
 */
function init(options) {
  createHeader(options);
  treemapViewer = new TreemapViewer(options, find('.panel--treemap'));
  treemapViewer.show({
    rootNodeId: options.showViewId,
    partitionBy: 'bytes',
  });

  // For debugging.
  window.__treemapViewer = treemapViewer;

  if (self.opener && !self.opener.closed) {
    self.opener.postMessage({rendered: true}, '*');
  }

  if (window.ga) {
    // TODO what are these?
    // window.ga('send', 'event', 'treemap', 'open in viewer');
    window.ga('send', 'event', 'report', 'open in viewer');
  }
}

function main() {
  if (window.__TREEMAP_OPTIONS) {
    init(window.__TREEMAP_OPTIONS);
  } else {
    window.addEventListener('message', e => {
      if (e.source !== self.opener) return;
      /** @type {Treemap.Options} */
      const options = e.data;
      const {lhr, showViewId} = options;
      const documentUrl = lhr.requestedUrl;

      if (!documentUrl || !showViewId) return;

      // Allows for saving the document and loading with data intact.
      const scriptEl = document.createElement('script');
      scriptEl.innerText = `window.__TREEMAP_OPTIONS = ${JSON.stringify(options)};`;
      document.head.append(scriptEl);

      init(options);
    });
  }

  // If the page was opened as a popup, tell the opening window we're ready.
  if (self.opener && !self.opener.closed) {
    self.opener.postMessage({opened: true}, '*');
  }

  treemapViewer.initListeners();
}

async function debugWrapper() {
  if (new URLSearchParams(window.location.search).has('debug')) {
    const response = await fetch('debug.json');
    const json = await response.json();
    window.__TREEMAP_OPTIONS = json;
  }

  main();
}

document.addEventListener('DOMContentLoaded', debugWrapper);
