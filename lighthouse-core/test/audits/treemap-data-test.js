/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

// const assert = require('assert').strict;
const TreemapData = require('../../audits/treemap-data.js');
// const networkRecordsToDevtoolsLog = require('../network-records-to-devtools-log.js');
const {loadSourceMapFixture} = require('../test-utils.js');

/* eslint-env jest */

/**
 * @param {string} name
 */
function load(name) {
  const data = loadSourceMapFixture(name);
  if (!data.usage) throw new Error('exepcted usage');
  return data;
}

describe('TreemapData audit', () => {
  describe('.prepareTreemapNodes', () => {
    it('basics 1', () => {
      const rootNode = TreemapData.prepareTreemapNodes('', {'main.js': {bytes: 100}});
      expect(rootNode).toMatchInlineSnapshot(`
        Object {
          "bytes": 100,
          "children": undefined,
          "id": "/main.js",
        }
      `);
    });

    it('basics 2', () => {
      const sourcesData = {
        'some/prefix/main.js': {bytes: 100},
        'a.js': {bytes: 101},
      };
      const rootNode = TreemapData.prepareTreemapNodes('some/prefix', sourcesData);
      expect(rootNode).toMatchInlineSnapshot(`
        Object {
          "bytes": 201,
          "children": Array [
            Object {
              "bytes": 100,
              "children": undefined,
              "id": "/main.js",
            },
            Object {
              "bytes": 101,
              "id": "a.js",
            },
          ],
          "id": "some/prefix",
        }
      `);
    });

    it('basics 3', () => {
      const sourcesData = {
        'lib/a.js': {bytes: 100},
        'main.js': {bytes: 101},
      };
      const rootNode = TreemapData.prepareTreemapNodes('', sourcesData);
      expect(rootNode).toMatchInlineSnapshot(`
        Object {
          "bytes": 201,
          "children": Array [
            Object {
              "bytes": 100,
              "children": undefined,
              "id": "lib/a.js",
            },
            Object {
              "bytes": 101,
              "id": "main.js",
            },
          ],
          "id": "",
        }
      `);
    });

    it('basics 4', () => {
      const sourcesData = {
        'lib/folder/a.js': {bytes: 100},
        'lib/folder/b.js': {bytes: 101},
      };
      const rootNode = TreemapData.prepareTreemapNodes('', sourcesData);
      expect(rootNode).toMatchInlineSnapshot(`
        Object {
          "bytes": 201,
          "children": Array [
            Object {
              "bytes": 201,
              "children": Array [
                Object {
                  "bytes": 100,
                  "id": "a.js",
                },
                Object {
                  "bytes": 101,
                  "id": "b.js",
                },
              ],
              "id": "folder",
            },
          ],
          "id": "/lib",
        }
      `);
    });
  });
});

// ...
