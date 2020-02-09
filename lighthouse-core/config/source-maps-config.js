/**
 * @license Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/** @fileoverview Temporary config for new source map features.
 * Allows for source map audits to land in master without being enabled by default.
 */

/** @type {LH.Config.Json} */
const config = {
  extends: 'lighthouse:default',
  passes: [{
    passName: 'defaultPass',
    gatherers: [
      'source-maps',
    ],
  }],
  audits: [
    // About to be added.
    // 'bundle-duplication',
  ],
  // @ts-ignore: `title` is required in CategoryJson. setting to the same value as the default
  // config is awkward - easier to omit the property here. Will defer to default config.
  categories: {
    'performance': {
      auditRefs: [
        // About to be added.
        // {id: 'bundle-duplication', weight: 0, group: 'load-opportunities'},
      ],
    },
  },
};

module.exports = config;
