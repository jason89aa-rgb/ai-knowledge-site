type Xml = { tag: string; attrs: Record<string, string>; children: Xml[]; text: string };

function decode(value: string) {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, name: string) => {
    if (!name.startsWith("#")) return entities[name] ?? entity;
    const point = name.startsWith("#x") ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return point <= 0x10ffff ? String.fromCodePoint(point) : "";
  });
}

// Parse the provider XML without resolving DTDs or external entities.
export function parseXml(input: string) {
  const root: Xml = { tag: "", attrs: {}, children: [], text: "" };
  const stack = [root];
  for (const match of input.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/(?:[\w.-]+:)?([\w.-]+)\s*>|<(?:[\w.-]+:)?([\w.-]+)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/g)) {
    const current = stack[stack.length - 1];
    if (match[1] !== undefined) current.text += match[1];
    if (match[2] && current.tag === match[2].toLowerCase()) stack.pop();
    if (match[3]) {
      const node: Xml = { tag: match[3].toLowerCase(), attrs: {}, children: [], text: "" };
      for (const attr of match[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        node.attrs[attr[1]] = decode(attr[2] ?? attr[3]);
      }
      current.children.push(node);
      if (!match[4].trimEnd().endsWith("/")) stack.push(node);
    }
    if (match[5]) current.text += decode(match[5]);
  }
  return root;
}

export function all(node: Xml | undefined, tag: string): Xml[] {
  if (!node) return [];
  const wanted = tag.toLowerCase();
  const found: Xml[] = [];
  const queue = [...node.children].reverse();
  while (queue.length) {
    const child = queue.pop()!;
    if (child.tag === wanted) found.push(child);
    for (let i = child.children.length - 1; i >= 0; i--) queue.push(child.children[i]);
  }
  return found;
}

export const first = (node: Xml | undefined, tag: string) => all(node, tag)[0];
export const nodeText = (node?: Xml): string => node ? [node.text, ...node.children.map(nodeText)].join(" ").trim() : "";
export const value = (node: Xml | undefined, tag: string) => nodeText(first(node, tag));
