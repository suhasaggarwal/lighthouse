/**
 * @license Copyright 2018 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {promisify} = require('util');
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const mkdir = fs.promises.mkdir;

const browserify = require('browserify');
const cpy = require('cpy');
const ghPages = require('gh-pages');
const glob = promisify(require('glob'));
const lighthousePackage = require('../package.json');
const rimraf = require('rimraf');
const terser = require('terser');
const {minifyFileTransform} = require('./build-utils.js');

const htmlReportAssets = require('../lighthouse-core/report/html/html-report-assets.js');
const sourceDir = `${__dirname}/../lighthouse-treemap`;
const distDir = `${__dirname}/../dist/treemap`;

const license = `/*
* @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
* or implied. See the License for the specific language governing
* permissions and limitations under the License.
*/`;

/**
 * Evaluates path glob and loads all identified files as an array of strings.
 * @param {string} pattern
 * @return {Promise<Array<string>>}
 */
async function loadFiles(pattern) {
  const filePaths = await glob(pattern);
  return Promise.all(filePaths.map(path => readFileAsync(path, {encoding: 'utf8'})));
}

/**
 * Write a file to filePath, creating parent directories if needed.
 * @param {string} filePath
 * @param {string} data
 * @return {Promise<void>}
 */
async function safeWriteFileAsync(filePath, data) {
  const fileDir = path.dirname(filePath);
  await mkdir(fileDir, {recursive: true});
  return writeFileAsync(filePath, data);
}

/**
 * Copy static assets.
 * @return {Promise<void>}
 */
function copyAssets() {
  return cpy([
    'images/**/*',
    'index.html',
    'debug.json',
  ], distDir, {
    cwd: `${sourceDir}/app/`,
    parents: true,
  });
}

/**
 * Concat report and viewer stylesheets into single treemap.css file.
 * @return {Promise<void>}
 */
async function css() {
  const viewerCss = await readFileAsync(`${sourceDir}/app/styles/treemap.css`, {encoding: 'utf8'});
  await safeWriteFileAsync(`${distDir}/styles/treemap.css`, [viewerCss].join('\n'));
}

/**
 * Insert report templates into html and copy to dist.
 * @return {Promise<void>}
 */
async function html() {
  let htmlSrc = await readFileAsync(`${sourceDir}/app/index.html`, {encoding: 'utf8'});
  await safeWriteFileAsync(`${distDir}/index.html`, htmlSrc);
}

/**
 * Combine multiple JS files into single treemap.js file.
 * @return {Promise<void>}
 */
async function compileJs() {
  // idb-keyval dependency.
  const idbKeyvalPath = require.resolve('idb-keyval/dist/idb-keyval-min.js');
  const idbKeyvalJs = await readFileAsync(idbKeyvalPath, 'utf8');

  // Viewer-specific JS files.
  const srcJsFiles = await loadFiles(`${sourceDir}/app/src/*.js`);

  const contents = [
    `"use strict";`,
    // idbKeyvalJs,
    ...srcJsFiles,
    fs.readFileSync(`${__dirname}/../node_modules/webtreemap-cdt/dist/webtreemap.js`, 'utf-8'),
  ];
  const options = {
    output: {preamble: license}, // Insert license at top.
  };
  const uglified = terser.minify(contents, options);
  if (uglified.error || !uglified.code) {
    throw uglified.error;
  }

  await safeWriteFileAsync(`${distDir}/src/treemap.js`, uglified.code);
}

/**
 * Publish treemap to gh-pages branch.
 * @return {Promise<void>}
 */
async function deploy() {
  return new Promise((resolve, reject) => {
    ghPages.publish(distDir, {
      add: true, // keep existing files
      dest: 'treemap',
      message: `Update treemap to lighthouse@${lighthousePackage.version}`,
    }, err => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Build treemap, optionally deploying to gh-pages if `--deploy` flag was set.
 */
async function run() {
  // Clean and build.
  // rimraf.sync(distDir);
  await Promise.all([
    compileJs(),
    html(),
    css(),
    copyAssets(),
  ]);

  const argv = process.argv.slice(2);
  if (argv.includes('--deploy')) {
    await deploy();
  }
}

run();
