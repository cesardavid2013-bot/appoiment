import { Fragment, type ReactNode } from "react";

export type RichTags = Record<string, (children: ReactNode) => ReactNode>;

const TAG = /<([A-Za-z][\w-]*)>([\s\S]*?)<\/\1>/;

/**
 * Renders a translated message that marks up part of its text, so links and
 * emphasis stay inside whole sentences: `rich(t("agree"), { terms: (c) => <Link href="/legal/terms">{c}</Link> })`
 * for "By continuing you agree to our <terms>Terms</terms>." Unknown tags render as plain text.
 * Works in server and client components.
 */
export function rich(message: string, tags: RichTags): ReactNode {
  const out: ReactNode[] = [];
  let rest = message;
  let i = 0;
  for (let m = TAG.exec(rest); m; m = TAG.exec(rest)) {
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const [, name, inner] = m;
    const render = tags[name];
    const children = rich(inner, tags);
    out.push(<Fragment key={i++}>{render ? render(children) : children}</Fragment>);
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push(rest);
  return out.length === 1 && typeof out[0] === "string" ? out[0] : out;
}
