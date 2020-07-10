/**
 * @license Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const thirdPartyWeb = require('third-party-web/httparchive-nostats-subset');
const Audit = require('./audit.js');
const i18n = require('../lib/i18n/i18n.js');
const JsBundles = require('../computed/js-bundles.js');
const MapValidator = require('../lib/source-maps/validate-source-map.js');

// TODO: web.dev docs, write description
const UIStrings = {
  /** Title of a Lighthouse audit that provides detail on HTTP to HTTPS redirects. This descriptive title is shown to users when HTTP traffic is redirected to HTTPS. */
  title: 'Page has valid source maps',
  /** Title of a Lighthouse audit that provides detail on HTTP to HTTPS redirects. This descriptive title is shown to users when HTTP traffic is not redirected to HTTPS. */
  failureTitle: 'Missing source maps for large first party JavaScript',
  /** Description of a Lighthouse audit that tells the user that their JavaScript source maps are invalid or missing. This is displayed after a user expands the section to see more. No character length limits. 'Learn More' becomes link text to additional documentation. */
  description: 'your maps are sad. [Learn more](https://web.dev/valid-source-maps).',
};

const str_ = i18n.createMessageInstanceIdFn(__filename, UIStrings);

const LARGE_JS_BYTE_THRESHOLD = 500 * 1024;

/**
 * Returns true if the script URL is either:
 * (1) a known third-party script or
 * (2) the same as the (redirected) requested Lighthouse URL
 * @param {string} url
 * @param {string} finalUrl
 */
function isFirstParty(url, finalUrl) {
  try {
    const entity = thirdPartyWeb.getEntity(url);
    if (!entity) return true;
    return entity === thirdPartyWeb.getEntity(finalUrl);
  } catch (_) {
    return false;
  }
}

class ValidSourceMaps extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'valid-source-maps',
      title: str_(UIStrings.title),
      failureTitle: str_(UIStrings.failureTitle),
      description: str_(UIStrings.description),
      requiredArtifacts: ['ScriptElements', 'SourceMaps', 'URL'],
    };
  }

  /**
   * Returns true if the size of the script exceeds a static threshold
   * @param {LH.Artifacts.ScriptElement} scriptElement
   * @param {string} finalURL
   * @return {boolean}
   */
  static isLargeFirstPartyJS(scriptElement, finalURL) {
    if (scriptElement.content === null) return false;

    const isLargeJS = scriptElement.content.length >= LARGE_JS_BYTE_THRESHOLD;
    const isFirstPartyJS = scriptElement.src ? isFirstParty(scriptElement.src, finalURL) : false;

    return isLargeJS && isFirstPartyJS;
  }

  /**
   * @param {LH.Artifacts.Bundle} bundle
   * @param {LHSourceMap.Entry} mapping
   * @return {string[] | null}
   */
  static getSourceLines(bundle, mapping) {
    if (bundle.rawMap && bundle.rawMap.sourcesContent) {
      const index = bundle.rawMap.sources.indexOf(mapping.sourceURL);

      if (index >= 0) {
        return bundle.rawMap.sourcesContent[index].split('\n');
      }
    }

    return null;
  }

  /**
   * @param {LH.Artifacts.SourceMap} sourceMap
   * @param {LH.Artifacts.Bundle[]} bundles
   * @param {any[]} errors
   */
  static validateMap(sourceMap, bundles, errors) {
    if (bundles) {
      for (let i = 0; i < bundles.length; i++) {
        const bundle = bundles[i];

        if (bundle.script.src === sourceMap.scriptUrl &&
          bundle.map && bundle.map._mappings &&
          bundle.script && bundle.script.content &&
          bundle.rawMap && bundle.rawMap.sourcesContent) {
          const generatedLines = bundle.script.content.split('\n');

          bundle.map._mappings.forEach((mapping) => {
            const sourceLines = this.getSourceLines(bundle, mapping);

            if (sourceLines) {
              const newError = MapValidator.MapValidator.validateMapping(
                  mapping,
                  sourceLines,
                  generatedLines);
              if (newError) errors.push(newError.message);
            } else {
              // Some kind of error happened, what should we push?
            }
          });
        }
      }
    }

    return errors;
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   */
  static async audit(artifacts, context) {
    const bundles = await JsBundles.request(artifacts, context);

    const {SourceMaps} = artifacts;

    /** @type {Set<string>} */
    const isMissingMapForLargeFirstPartyScriptUrl = new Set();

    let missingMapsForLargeFirstPartyFile = false;
    const results = [];
    for (const ScriptElement of artifacts.ScriptElements) {
      if (!ScriptElement.src) continue; // TODO: inline scripts, how do they work?

      const SourceMap = SourceMaps.find(m => m.scriptUrl === ScriptElement.src);
      let errors = [];
      const isLargeFirstParty = this.isLargeFirstPartyJS(ScriptElement, artifacts.URL.finalUrl);

      if (isLargeFirstParty && (!SourceMap || !SourceMap.map)) {
        missingMapsForLargeFirstPartyFile = true;
        isMissingMapForLargeFirstPartyScriptUrl.add(ScriptElement.src);
        errors.push('Large JavaScript file is missing a source map');
      }

      if (SourceMap && !SourceMap.map) {
        errors.push(SourceMap.errorMessage);
      }

      // Sources content errors.
      if (SourceMap && SourceMap.map) {
        const sourcesContent = SourceMap.map.sourcesContent || [];
        let missingSourcesContentCount = 0;
        for (let i = 0; i < SourceMap.map.sources.length; i++) {
          if (sourcesContent.length < i || !sourcesContent[i]) missingSourcesContentCount += 1;
        }
        if (missingSourcesContentCount > 0) {
          errors.push(`missing ${missingSourcesContentCount} items in \`.sourcesContent\``);
        }

        errors = this.validateMap(SourceMap, bundles, errors);
      }

      // TODO(cjamcl) validate (maybe source-map-validator) the map. Can punt this until maps
      // are used for mapping in the report (we'd show a snippet of source code, or
      // show a source position instead of generated position).

      if (SourceMap || errors.length) {
        results.push({
          scriptUrl: ScriptElement.src,
          sourceMapUrl: SourceMap && SourceMap.sourceMapUrl,
          errors,
        });
      }
    }

    /** @type {LH.Audit.Details.Table['headings']} */
    const headings = [
      /* eslint-disable max-len */
      {
        key: 'scriptUrl',
        itemType: 'url',
        subRows: {key: 'errors', itemType: 'text'},
        text: str_(i18n.UIStrings.columnURL),
      },
      {key: 'sourceMapUrl', itemType: 'url', text: 'Map URL'}, // TODO uistring
      /* eslint-enable max-len */
    ];

    results.sort((a, b) => {
      // Show the items that can fail the audit first.
      const missingMapA = isMissingMapForLargeFirstPartyScriptUrl.has(a.scriptUrl);
      const missingMapB = isMissingMapForLargeFirstPartyScriptUrl.has(b.scriptUrl);
      if (missingMapA && !missingMapB) return -1;
      if (!missingMapA && missingMapB) return 1;

      // Then sort by number of errors.
      if (a.errors.length && !b.errors.length) return -1;
      if (!a.errors.length && b.errors.length) return 1;

      // Then sort by script url.
      return b.scriptUrl.localeCompare(a.scriptUrl);
    });

    // Only fails if `missingMapsForLargeFirstPartyFile` is true. All other errors
    // are diagnostical.
    return {
      score: missingMapsForLargeFirstPartyFile ? 0 : 1,
      details: Audit.makeTableDetails(headings, results),
    };
  }
}

module.exports = ValidSourceMaps;
module.exports.UIStrings = UIStrings;
