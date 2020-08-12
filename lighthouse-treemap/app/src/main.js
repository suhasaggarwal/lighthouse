/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/** @type {TreemapViewer} */
let treemapViewer;

/**
 *
 * @param {Treemap.Node2} node
 * @param {(node: Treemap.Node2, fullId: string) => void} fn
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

/**
 * @param {string} string
 * @param {number} length
 */
function elide(string, length) {
  if (string.length <= length) return string;
  return string.slice(0, length) + '…';
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
    /** @type {Treemap.RootNode[]} */
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
    this.getHue = Util.stableHasher(Util.COLOR_HUES);
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
      const nodeEl = e.target.closest('.webtreemap-node'); Util.COLOR_HUES;
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
    const partitionBySelectorEl = Util.find('.partition-selector');
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
          return `${Util.format(value, unit)} (${Math.round(value / total * 100)}%)`;
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
      // // node.id = `${elide(node.originalId, 60)} • ${Util.formatBytes(bytes)} • ${Math.round(bytes / total * 100)}%`;
      // node.id = `${title} • ${Util.format(value, unit)} ${this.mode.partitionBy} (${Math.round(value / total * 100)}%)`;


      // if (this.mode.partitionBy === 'bytes') {
      //   const total = this.currentRootNode.bytes;
      //   node.id = `${elide(node.originalId, 60)} • ${Util.formatBytes(bytes)} • ${Math.round(bytes / total * 100)}%`;
      // } else if (this.mode.partitionBy === 'wastedBytes') {
      //   // node.id = `${elide(node.originalId, 60)} • ${Util.formatBytes(wastedBytes)} wasted • ${Math.round((1 - wastedBytes / bytes) * 100)}% usage`;
      //   node.id = `${elide(node.originalId, 60)} • ${Util.formatBytes(wastedBytes)} wasted • ${Math.round(wastedBytes / this.currentRootNode.wastedBytes * 100)}%`;
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

      node.dom.style.backgroundColor = Util.hsl(hue, sat, Math.round(lum));
      node.dom.style.color = lum > 50 ? 'black' : 'white';
    });
  }

  /**
   * @param {Treemap.RootNode[]} rootNodes
   */
  createTable(rootNodes) {
    const gridPanelEl = Util.find('.panel--datagrid');

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
        {title: 'Size', field: 'bytes', align: 'left', formatter: cell => Util.formatBytes(cell.getValue())},
        {title: 'Size', field: 'bytes', formatter: 'progress', formatterParams: {min: 0, max: maxSize, width: '25%'}},
        {title: 'Unused Bytes', field: 'wastedBytes', align: 'left', formatter: cell => Util.formatBytes(cell.getValue())},
        {title: 'Unused Bytes', field: 'wastedBytes', formatter: 'progress', formatterParams: {min: 0, max: maxWastedBytes, width: '25%'}},
      ],
    });
  }

  toggleTable() {
    const mainEl = Util.find('main');
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
  const bundleSelectorEl = Util.find('.bundle-selector');
  const partitionBySelectorEl = Util.find('.partition-selector');
  const toggleTableBtn = Util.find('.lh-button--toggle-table');

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
    .sort((a, b) => Util.sortByPrecedence(['javascript'], a, b));
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
 * @param {Treemap.RootNode[]} rootNodes
 * @param {string=} currentViewId
 */
function createViewModes(rootNodes, currentViewId) {
  const javascriptRootNodes = rootNodes.filter(n => n.group === 'javascript');

  const viewModesPanel = Util.find('.panel--modals');
  /**
   * @param {string} viewId
   * @param {string} name
   * @param {Partial<Treemap.Mode>} modeOptions
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
    makeViewMode('all', `All (${Util.formatBytes(bytes)})`, {
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
    makeViewMode('unused', `Unused JS (${Util.formatBytes(bytes)})`, {
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
    makeViewMode('large', `Large Modules (${Util.formatBytes(bytes)})`, {
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
    makeViewMode('duplicate', `Duplicate Modules (${Util.formatBytes(bytes)})`, {
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
  treemapViewer = new TreemapViewer(options, Util.find('.panel--treemap'));
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
