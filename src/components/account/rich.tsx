import { Fragment, type ReactNode } from "react";

/**
 * Renders a translated sentence that contains inline markup, so links and
 * emphasis stay inside one translatable string:
 * `rich(t("hint"), { link: (text) => <Link href="/x">{text}</Link> })` for "Open <link>Bookings</link> to…".
 * Tags are `<name>…</name>` and don't nest.
 */
export function rich(text: string, tags: Record<string, (chunks: string) => ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const render = tags[m[1]];
    out.push(<Fragment key={m.index}>{render ? render(m[2]) : m[2]}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
