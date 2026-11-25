// A tiny DOM helper for the popup and options page. Text only goes in as textContent, never as HTML.
type Props<T> = Partial<Omit<T, "style" | "children">> & { class?: string; style?: string };

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props<HTMLElementTagNameMap[K]> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: className, style, ...rest } = props;
  if (className) node.className = className;
  if (style) node.setAttribute("style", style);
  Object.assign(node, rest);
  node.append(...children);
  return node;
}
