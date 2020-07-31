/**
 * @license Copyright 2020 Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

class LineNotFoundError extends Error {
  /**
   * @param {string} source
   * @param {{ line: number, column: number }} options
   */
  constructor(source, options) {
    super();
    this.name = 'LineNotFoundError';
    this.source = source;

    const { line, column } = options;
    this.line = line;
    this.column = column;
    this.message = 'Line not found in source file';

    /** @type {string[]} */
    this.resolutions = [];
  }
}

class BadTokenError extends Error {

  /**
   * @param {string} source
   * @param {{ token: string, expected: string, mapping: LHSourceMap.Entry }} options
   */
  constructor(source, options) {
    super();
    this.name = 'BadTokenError';
    this.source = source;

    const { token, expected, mapping } = options;
    this.token = token;
    this.expected = expected;
    this.mapping = mapping;
    this.message = 'Expected token not in correct location';

    /** @type {string[]} */
    this.resolutions = [];
  }
}

class BadColumnError extends BadTokenError {
  /**
   * @param {string} source
   * @param {{ token: string, expected: string, mapping: LHSourceMap.Entry }} options
   */
  constructor(source, options) {
    super(source, options);
    this.name = 'BadColumnError';
  }
}

class MapValidator {

  /**
   * @param {LHSourceMap.Entry} mapping
   * @param {string[]} sourceLines
   * @param {string[]} generatedLines
   */
  static validateMapping(mapping, sourceLines, generatedLines) {
    if (!mapping.name) return {message: "Mapping has no name"};

    let origLine;
    try {
      origLine = sourceLines[mapping.sourceLineNumber - 1];
    } catch (e) {
      /** eslint no-empty:0 */
    }

    if (!origLine) {
      return new LineNotFoundError(mapping.sourceURL, {
        line: mapping.sourceLineNumber,
        column: mapping.sourceColumnNumber
      });
    }

    let sourceToken = origLine
      .slice(mapping.sourceColumnNumber, mapping.sourceColumnNumber + mapping.name.length)
      .trim();

    // Token matches what we expect; everything looks good, bail out
    if (sourceToken === mapping.name) {
      return null;
    }

    // Start of token starts with a quote or apostrophe. This might be
    // a bug in Uglify where it maps a token to the string of a token
    // incorrectly - but it should still be fine for end users.
    if (sourceToken.startsWith("'") || sourceToken.startsWith('"')) {
      sourceToken = origLine
        .slice(
          mapping.sourceColumnNumber + 1,
          mapping.sourceColumnNumber + mapping.name.length + 1
        )
        .trim();
    }

    if (sourceToken === mapping.name) {
      return null;
    }

    // If the line _contains_ the expected token somewhere, the source
    // map will likely work fine (especially for Sentry).
    const ErrorClass =
      origLine.indexOf(mapping.name) > -1 ? BadColumnError : BadTokenError;

    const generatedColumn = mapping.columnNumber;

    let generatedLine;
    try {
      generatedLine = generatedLines[mapping.lineNumber - 1];
    } catch (e) {
    } // eslint-disable-line no-empty

    // Take 5 lines of original context. Type: Array<[number, string]>
    const contextLines = [];
    for (
      let i = Math.max(mapping.sourceLineNumber - 3, 0);
      i < mapping.sourceLineNumber + 2 && i < sourceLines.length;
      i++
    ) {
      contextLines.push([i + 1, sourceLines[i]]);
    }

    // Take 100 chars of context around generated line
    const generatedContext = (generatedLine || '').slice(
      generatedColumn - 50,
      generatedColumn + 50
    );

    return new ErrorClass(mapping.sourceURL, {
      token: sourceToken,
      expected: mapping.name,
      mapping: {
        // @ts-ignore
        originalContext: contextLines,
        originalLine: mapping.sourceLineNumber,
        originalColumn: mapping.sourceColumnNumber,
        generatedContext,
        generatedLine: mapping.lineNumber,
        generatedColumn: mapping.columnNumber
      }
    });
  }
}

module.exports = {MapValidator};
