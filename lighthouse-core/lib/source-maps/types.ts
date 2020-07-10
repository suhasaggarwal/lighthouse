export interface ContextMapping {
  originalContext: Array<[number, string]>; // Array of line number/source code tuples, e.g. [1, "const x = 1;"]
  generatedContext: string;
  originalLine: number;
  originalColumn: number;
  generatedLine: number;
  generatedColumn: number;
}

class LineNotFoundError extends Error {
  source: string;
  column: number;
  line: number;
  resolutions: Array<string>;

  constructor(source: string, options: { line: number; column: number }) {
    super();
    this.name = 'LineNotFoundError';
    this.source = source;

    const { line, column } = options;
    this.line = line;
    this.column = column;
    this.message = 'Line not found in source file';
    this.resolutions = [];
  }
}

class BadTokenError extends Error {
  source: string;
  token: string;
  expected: string;
  mapping: ContextMapping;
  resolutions: Array<string>;

  constructor(
    source: string,
    options: { token: string; expected: string; mapping: ContextMapping }
  ) {
    super();
    this.name = 'BadTokenError';
    this.source = source;

    const { token, expected, mapping } = options;
    this.token = token;
    this.expected = expected;
    this.mapping = mapping;

    this.message = 'Expected token not in correct location';
    this.resolutions = [];
  }
}

class BadColumnError extends BadTokenError {
  constructor(
    source: string,
    options: { token: string; expected: string; mapping: ContextMapping }
  ) {
    super(source, options);
    this.name = 'BadColumnError';
  }
}

export {LineNotFoundError, BadTokenError, BadColumnError};
