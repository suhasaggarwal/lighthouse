/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const KB = 1024;
const MB = KB * KB;

class Util {
  /**
   * @param {string} string
   * @param {number} length
   */
  static elide(string, length) {
    if (string.length <= length) return string;
    return string.slice(0, length) + '…';
  }

  /**
   * Guaranteed context.querySelector. Always returns an element or throws if
   * nothing matches query.
   * @param {string} query
   * @param {ParentNode=} context
   * @return {HTMLElement}
   */
  static find(query, context = document) {
    /** @type {?HTMLElement} */
    const result = context.querySelector(query);
    if (result === null) {
      throw new Error(`query ${query} not found`);
    }
    return result;
  }

  /**
   * @param {number} bytes
   */
  static formatBytes(bytes) {
    if (bytes >= MB) return (bytes / MB).toFixed(2) + ' MB';
    if (bytes >= KB) return (bytes / KB).toFixed(0) + ' KB';
    return bytes + ' B';
  }

  /**
   * @param {number} value
   * @param {string} unit
   */
  static format(value, unit) {
    if (unit === 'bytes') return Util.formatBytes(value);
    if (unit === 'time') return `${value} ms`;
    return `${value} ${unit}`;
  }

  /**
   * @example array.sort((a, b) => sortByPrecedence(['first', 'me next. alpha sort after'], a, b));
   * @template T
   * @param {T[]} precedence
   * @param {T} a
   * @param {T} b
   */
  static sortByPrecedence(precedence, a, b) {
    const aIndex = precedence.indexOf(a);
    const bIndex = precedence.indexOf(b);

    // If neither value has a title with a predefined order, use an alphabetical comparison.
    if (aIndex === -1 && bIndex === -1) {
      return String(a).localeCompare(String(b));
    }

    // If just one value has a title with a predefined order, it is greater.
    if (aIndex === -1 && bIndex >= 0) {
      return 1;
    }
    if (bIndex === -1 && aIndex >= 0) {
      return -1;
    }

    // Both values have a title with a predefined order, so do a simple comparison.
    return aIndex - bIndex;
  }

  /**
   * @template T
   * @param {T[]} items
   * @return {T|null}
   */
  static stableHasher(items) {
    // Clone.
    items = [...items];

    const assignedItems = {};
    return hash => {
      if (hash in assignedItems) return assignedItems[hash];
      if (items.length === 0) return null;
      const [assignedColor] = items.splice(hash % items.length, 1);
      assignedItems[hash] = assignedColor;
      return assignedColor;
    };
  }

  /**
   * @param {number} h
   * @param {number} s
   * @param {number} l
   */
  static hsl(h, s, l) {
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  /**
   * Brilliant code by akinuri
   * https://stackoverflow.com/a/39147465
   * @param {number} r
   * @param {number} g
   * @param {number} b
   */
  static rgb2hue(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const c = max - min;
    let hue;
    if (c == 0) {
      hue = 0;
    } else {
      switch (max) {
        case r:
          var segment = (g - b) / c;
          var shift = 0 / 60; // R° / (360° / hex sides)
          if (segment < 0) { // hue > 180, full rotation
            shift = 360 / 60; // R° / (360° / hex sides)
          }
          hue = segment + shift;
          break;
        case g:
          var segment = (b - r) / c;
          var shift = 120 / 60; // G° / (360° / hex sides)
          hue = segment + shift;
          break;
        case b:
          var segment = (r - g) / c;
          var shift = 240 / 60; // B° / (360° / hex sides)
          hue = segment + shift;
          break;
      }
    }
    return hue * 60; // hue is in [0,6], scale it up
  }
}

// From DevTools:
// https://cs.chromium.org/chromium/src/third_party/devtools-frontend/src/front_end/quick_open/CommandMenu.js?l=255&rcl=ad5c586c30a6bc55962b7a96b0533911c86bd4fc
Util.COLOR_HUES = [
  '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#03A9F4',
  '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFC107',
  '#FF9800', '#FF5722', '#795548', '#9E9E9E', '#607D8B',
].map(hex => {
  const hexParts = hex.slice(1).split(/(..)/).filter(Boolean);
  const [r, g, b] = hexParts.map(part => parseInt(part, 16));
  return Util.rgb2hue(r, g, b);
});

// node export for testing.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Util;
}
