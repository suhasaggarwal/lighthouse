/**
 * @license Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('./audit.js');
const i18n = require('../lib/i18n/i18n.js');

// TODO: web.dev docs, write description
const UIStrings = {
  /** Title of a Lighthouse audit that provides detail on HTTP to HTTPS redirects. This descriptive title is shown to users when HTTP traffic is redirected to HTTPS. */
  title: 'Page has valid source maps',
  /** Title of a Lighthouse audit that provides detail on HTTP to HTTPS redirects. This descriptive title is shown to users when HTTP traffic is not redirected to HTTPS. */
  failureTitle: 'Has invalid source maps',
  /** Description of a Lighthouse audit that tells the user that their JavaScript source maps are invalid or missing. This is displayed after a user expands the section to see more. No character length limits. 'Learn More' becomes link text to additional documentation. */
  description: 'your maps are sad. [Learn more](https://web.dev/valid-source-maps).',
};

const str_ = i18n.createMessageInstanceIdFn(__filename, UIStrings);

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
      requiredArtifacts: ['SourceMaps'],
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @return {LH.Audit.Product}
   */
  static audit(artifacts) {
    const {SourceMaps} = artifacts;

    const results = [];
    for (const sourceMapOrError of SourceMaps) {
      const {scriptUrl, sourceMapUrl} = sourceMapOrError;

      // Load errors.
      if (!sourceMapOrError.map) {
        const error = sourceMapOrError.errorMessage;
        results.push({
          scriptUrl,
          sourceMapUrl,
          error,
        });
        continue;
      }

      const map = sourceMapOrError.map;

      // TODO(cjamcl) validate (maybe source-map-validator) the map. Can punt this until maps
      // are used for mapping in the report (we'd show a snippet of source code, or 
      // show a source position instead of generated position).

      // Sources content errors.
      const sourcesContent = map.sourcesContent || [];
      let missingSourcesContentCount = 0;
      for (let i = 0; i < map.sources.length; i++) {
        if (sourcesContent.length < i || !sourcesContent[i]) missingSourcesContentCount += 1;
      }
      if (missingSourcesContentCount > 0) {
        results.push({
          scriptUrl: scriptUrl,
          sourceMapUrl: sourceMapUrl,
          error: `missing ${missingSourcesContentCount} items in \`.sourcesContent\``,
        });
        continue;
      }

      results.push({
        scriptUrl: scriptUrl,
        sourceMapUrl: sourceMapUrl,
      });
    }

    // TODO(cjamcl) find any script urls that look like bundled code but don't have
    // a source map.

    if (SourceMaps.length === 0) {
      return {
        score: 1,
        notApplicable: true,
      };
    }

    /** @type {LH.Audit.Details.Table['headings']} */
    const headings = [
      {key: 'scriptUrl', itemType: 'url', text: str_(i18n.UIStrings.columnURL)},
      {key: 'sourceMapUrl', itemType: 'url', text: 'Map URL'}, // TODO uistring
      {key: 'error', itemType: 'code', text: 'Error'}, // TODO uistring
    ];

    results.sort((a, b) => {
      if (a.error && !b.error) return -1;
      if (!a.error && b.error) return 1;
      return b.scriptUrl.localeCompare(a.scriptUrl);
    });
    const passed = !results.find(result => result.error);
    return {
      score: Number(passed),
      details: Audit.makeTableDetails(headings, results),
    };
  }
}

module.exports = ValidSourceMaps;
module.exports.UIStrings = UIStrings;
