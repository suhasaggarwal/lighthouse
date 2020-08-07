/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-env jest */
const ValidSourceMaps = require('../../audits/valid-source-maps.js');
const fs = require('fs');
const JSBundles = require('../../computed/js-bundles.js');

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

});
