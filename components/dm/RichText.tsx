import { Fragment, type ReactNode } from "react";

// The little formatting stat block text uses: **bold**, _italic_ and "- " list
// lines. Built from React elements only, so no text is ever parsed as HTML.

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|(?<![\w*])_[^_]+_(?![\w*]))/g);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-text">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>;
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`list-${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
        {items.map((item, index) => (
          <li key={index}>{inline(item, `li-${blocks.length}-${index}`)}</li>
        ))}
      </ul>,
    );
  };

  lines.forEach((line, index) => {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flushList();
    if (line.trim() === "") return;
    blocks.push(
      <span key={`line-${index}`} className="block">
        {inline(line, `line-${index}`)}
      </span>,
    );
  });
  flushList();

  return <span className={className}>{blocks}</span>;
}
