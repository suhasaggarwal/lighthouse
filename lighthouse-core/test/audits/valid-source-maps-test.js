/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-env jest */
const ValidSourceMaps = require('../../audits/valid-source-maps.js');
const assert = require('assert').strict;
const fs = require('fs');
const JSBundles = require('../../computed/js-bundles.js');
const MapValidator = require('../../lib/source-maps/validate-source-map.js');

function load(name) {
  const mapJson = fs.readFileSync(`${__dirname}/../fixtures/source-maps/${name}.js.map`, 'utf-8');
  const content = fs.readFileSync(`${__dirname}/../fixtures/source-maps/${name}.js`, 'utf-8');
  return {map: JSON.parse(mapJson), content};
}

describe('valid-source-maps', () => {
  let artifacts;
  let context;
  let bundles;

  beforeEach(async ()=> {
    const {map, content} = load('squoosh');
    artifacts = {
      SourceMaps: [{scriptUrl: 'https://example.com/sourcemap.min.js', map}],
      ScriptElements: [{src: 'https://example.com/sourcemap.min.js', content}],
    };

    context = {computedCache: new Map()};
    bundles = await JSBundles.request(artifacts, context);
  });

  it('should retrieve source lines', async () => {
    expect(bundles).toHaveLength(1);

    const bundle = bundles[0];
    const sourceLines = [];
    for (const mapping of bundle.map._mappings) {
      sourceLines.push(ValidSourceMaps.getSourceLines(bundle, mapping));
    }

    // do validation of the source lines here
  });

  it('should validate the source map', async () => {
    expect(bundles).toHaveLength(1);
    const {SourceMaps, ScriptElements} = artifacts;

    for (const ScriptElement of ScriptElements) {
      const SourceMap = SourceMaps.find(m => m.scriptUrl === ScriptElement.src);
      const errors = ValidSourceMaps.validateMap(SourceMap, bundles, []);
      console.log(errors);
    }
  });
});
