/**
 * @license Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('./audit.js');
const JsBundles = require('../computed/js-bundles.js');
const UnusedJavaScriptSummary = require('../computed/unused-javascript-summary.js');
const ModuleDuplication = require('../computed/module-duplication.js');
const NetworkRecords = require('../computed/network-records.js');
const ResourceSummary = require('../computed/resource-summary.js');
const BootupTime = require('../audits/bootup-time.js');
const MainThreadTasks = require('../computed/main-thread-tasks.js');
const {taskGroups} = require('../lib/tracehouse/task-groups.js');

// TODO: wrangle RootNode, Node2, node creation, etc...

/**
 * @typedef {Record<string, RootNode[]>} TreemapData
 */

/**
 * @typedef SourceData
 * @property {number} bytes
 * @property {number=} wastedBytes
 * @property {number=} executionTime
 * @property {string=} duplicate
 */

/**
 * @typedef RootNode
 * @property {string} id
 * @property {Node} node
 */

/**
 * @typedef Node
 * @property {string} id
 * @property {number=} bytes
 * @property {number=} wastedBytes
 * @property {number=} executionTime
 * @property {string=} duplicate
 * @property {Node[]=} children
 */


class TreemapDataAudit extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'treemap-data',
      scoreDisplayMode: Audit.SCORING_MODES.INFORMATIVE,
      title: 'Treemap Data',
      description: 'Used for treemap visualization.',
      requiredArtifacts:
        ['traces', 'devtoolsLogs', 'SourceMaps', 'ScriptElements', 'JsUsage', 'URL'],
    };
  }

  /**
   * @param {string} sourceRoot
   * @param {Record<string, SourceData>} sourcesData
   * @return {Node}
   */
  static prepareTreemapNodes(sourceRoot, sourcesData) {
    /**
     * @param {string} id
     */
    function newNode(id) {
      return {
        id,
        bytes: 0,
      };
    }

    /**
     * @param {string} source
     * @param {SourceData} data
     * @param {*} node
     */
    function addNode(source, data, node) {
      // Strip off the shared root.
      const sourcePathSegments = source.replace(sourceRoot, '').split(/\/+/);
      node.bytes += data.bytes;
      if (data.wastedBytes) node.wastedBytes += data.wastedBytes;

      sourcePathSegments.forEach((sourcePathSegment, i) => {
        if (!node.children) {
          node.children = [];
        }

        let child = node.children.find(child => child.id === sourcePathSegment);

        if (!child) {
          child = newNode(sourcePathSegment);
          node.children.push(child);
        }
        node = child;
        node.bytes += data.bytes;
        if (data.wastedBytes) node.wastedBytes = (node.wastedBytes || 0) + data.wastedBytes;
        if (data.duplicate !== undefined && i === sourcePathSegments.length - 1) {
          node.duplicate = data.duplicate;
        }
      });
    }

    const rootNode = newNode(sourceRoot);
    for (const [source, data] of Object.entries(sourcesData)) {
      addNode(source || `<unmapped>`, data, rootNode);
    }

    /**
     * Collapse nodes that have just one child + grandchild.
     * @param {*} node
     */
    function collapse(node) {
      if (node.children && node.children.length === 1) {
        node.id += '/' + node.children[0].id;
        node.children = node.children[0].children;
      }

      if (node.children) {
        for (const child of node.children) {
          collapse(child);
        }
      }
    }
    collapse(rootNode);

    // TODO(cjamcl): Should this structure be flattened for space savings?
    // Less JSON (no super nested children, and no repeated property names).

    return rootNode;
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   * @return {Promise<RootNode[]>}
   */
  static async makeJavaScriptRootNodes(artifacts, context) {
    /** @type {RootNode[]} */
    const rootNodes = [];

    const bundles = await JsBundles.request(artifacts, context);
    const duplication = await ModuleDuplication.request(artifacts, context);
    // const origin = new URL(artifacts.URL.finalUrl).origin;
    // TODO: this should be a computed artifact.
    const executionTimings = await TreemapDataAudit.getExecutionTimings(artifacts, context);

    /** @type {Array<{src: string, length: number, unusedJavascriptSummary?: import('../computed/unused-javascript-summary.js').Summary}>} */
    const scriptData = [
      {
        src: artifacts.URL.finalUrl,
        length: 0,
      },
    ];
    for (const scriptElement of artifacts.ScriptElements) {
      // Normalize ScriptElements so that inline scripts show up as a single entity.
      if (!scriptElement.src) {
        scriptData[0].length += (scriptElement.content || '').length;
        continue;
      }

      const url = scriptElement.src;
      const bundle = bundles.find(bundle => url === bundle.script.src);
      const scriptCoverages = artifacts.JsUsage[url];
      if (!bundle || !scriptCoverages) continue;

      scriptData.push({
        src: scriptElement.src,
        length: (scriptElement.content || '').length,
        unusedJavascriptSummary:
          await UnusedJavaScriptSummary.request({url, scriptCoverages, bundle}, context),
      });
    }

    for (const {src, length, unusedJavascriptSummary} of scriptData) {
      const bundle = bundles.find(bundle => bundle.script.src === src);

      const id = src;
      // TODO: just use the full URL and defer shortening to the treemap app.
      // if (id.startsWith(origin)) id = id.replace(origin, '/');

      let node;
      if (bundle && unusedJavascriptSummary && unusedJavascriptSummary.sourcesWastedBytes) {
        /** @type {Record<string, SourceData>} */
        const sourcesData = {};
        for (const source of Object.keys(bundle.sizes.files)) {
          /** @type {SourceData} */
          const sourceData = {
            bytes: bundle.sizes.files[source],
          };

          if (unusedJavascriptSummary && unusedJavascriptSummary.sourcesWastedBytes) {
            sourceData.wastedBytes = unusedJavascriptSummary.sourcesWastedBytes[source];
          }

          if (duplication) {
            const key = ModuleDuplication._normalizeSource(source);
            if (duplication.has(key)) sourceData.duplicate = key;
          }

          sourcesData[source] = sourceData;
        }

        node = this.prepareTreemapNodes(bundle.rawMap.sourceRoot || '', sourcesData);
      } else if (unusedJavascriptSummary) {
        node = {
          id,
          bytes: unusedJavascriptSummary.totalBytes,
          wastedBytes: unusedJavascriptSummary.wastedBytes,
          executionTime: 0,
        };
      } else {
        // ...?
        node = {
          id,
          bytes: length,
          wastedBytes: 0,
          executionTime: 0,
        };
      }

      const executionTiming = executionTimings.find(timing => timing.url === src);
      node.executionTime = executionTiming ? Math.round(executionTiming.total) : 0;

      rootNodes.push({
        id,
        node,
      });
    }

    return rootNodes;
  }

  /**
   * @param {LH.Artifacts.Bundle[]} bundles
   * @param {string} url
   * @param {LH.Artifacts['JsUsage']} JsUsage
   * @param {LH.Audit.Context} context
   */
  static async getUnusedJavascriptSummary(bundles, url, JsUsage, context) {
    const bundle = bundles.find(bundle => url === bundle.script.src);
    const scriptCoverages = JsUsage[url];
    if (!scriptCoverages) return;

    const unusedJsSumary =
      await UnusedJavaScriptSummary.request({url, scriptCoverages, bundle}, context);
    return unusedJsSumary;
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   * @return {Promise<RootNode>}
   */
  static async makeResourceSummaryRootNode(artifacts, context) {
    const devtoolsLog = artifacts.devtoolsLogs[Audit.DEFAULT_PASS];
    const networkRecords = await NetworkRecords.request(devtoolsLog, context);
    const origin = new URL(artifacts.URL.finalUrl).origin;

    const totalCount = networkRecords.length;
    let totalSize = 0;

    const children = [];
    for (const networkRecord of networkRecords) {
      // TODO: can we expand ResourceSummary to include transferSize, resourceSize, and networkRecords?
      const resourceType = ResourceSummary.determineResourceType(networkRecord);

      // @ts-ignore
      let child = children.find(child => child.id === resourceType);
      if (!child) {
        child = {
          id: resourceType,
          bytes: 0,
          children: [],
        };
        children.push(child);
      }

      totalSize += networkRecord.resourceSize;
      child.bytes += networkRecord.resourceSize;

      let id = networkRecord.url;
      if (id.startsWith(origin)) id = id.replace(origin, '/');
      child.children.push({
        id,
        bytes: networkRecord.resourceSize,
      });
    }

    return {
      id: 'Resource Summary',
      node: {
        id: `${totalCount} requests`,
        bytes: totalSize,
        children,
      },
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   */
  static async getExecutionTimings(artifacts, context) {
    const trace = artifacts.traces[BootupTime.DEFAULT_PASS];
    const devtoolsLog = artifacts.devtoolsLogs[BootupTime.DEFAULT_PASS];
    const networkRecords = await NetworkRecords.request(devtoolsLog, context);
    const tasks = await MainThreadTasks.request(trace, context);
    const multiplier = context.settings.throttlingMethod === 'simulate' ?
      context.settings.throttling.cpuSlowdownMultiplier : 1;

    const jsURLs = BootupTime.getJavaScriptURLs(networkRecords);
    const executionTimings = BootupTime.getExecutionTimingsByURL(tasks, jsURLs);

    return Array.from(executionTimings)
      .map(([url, timingByGroupId]) => {
        // Add up the totalExecutionTime for all the taskGroups
        let totalExecutionTimeForURL = 0;
        for (const [groupId, timespanMs] of Object.entries(timingByGroupId)) {
          timingByGroupId[groupId] = timespanMs * multiplier;
          totalExecutionTimeForURL += timespanMs * multiplier;
        }

        const scriptingTotal = timingByGroupId[taskGroups.scriptEvaluation.id] || 0;
        const parseCompileTotal = timingByGroupId[taskGroups.scriptParseCompile.id] || 0;

        // Add up all the JavaScript time of shown URLs
        // if (totalExecutionTimeForURL >= context.options.thresholdInMs) {
        // }

        // hadExcessiveChromeExtension = hadExcessiveChromeExtension ||
        //   (url.startsWith('chrome-extension:') && scriptingTotal > 100);

        return {
          url: url,
          total: totalExecutionTimeForURL,
          // Highlight the JavaScript task costs
          scripting: scriptingTotal,
          scriptParseCompile: parseCompileTotal,
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   * @return {Promise<LH.Audit.Product>}
   */
  static async audit(artifacts, context) {
    /** @type {TreemapData} */
    const treemapData = {
      js: await TreemapDataAudit.makeJavaScriptRootNodes(artifacts, context),
      resources: [await TreemapDataAudit.makeResourceSummaryRootNode(artifacts, context)],
    };

    /** @type {LH.Audit.Details.DebugData} */
    const details = {
      type: 'debugdata',
      treemapData,
    };

    return {
      score: 1,
      details,
    };
  }
}

module.exports = TreemapDataAudit;
