export function gameElementIds(source) {
  const ids = new Set();
  const patterns = [
    /getElementById\(\s*(['"`])([^'"`$]+)\1\s*\)/g,
    /querySelector(?:All)?\(\s*(['"`])#([\w-]+)\1\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) ids.add(m[2]);
  }
  return [...ids];
}
