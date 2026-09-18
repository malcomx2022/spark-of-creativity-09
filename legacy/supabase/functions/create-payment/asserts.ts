export function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(message ?? `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
  }
}

export function assertArrayIncludes<T>(actual: T[], expected: T[], message?: string) {
  for (const value of expected) {
    if (!actual.includes(value)) {
      throw new Error(message ?? `Expected array to include ${JSON.stringify(value)}. Got ${JSON.stringify(actual)}`);
    }
  }
}
