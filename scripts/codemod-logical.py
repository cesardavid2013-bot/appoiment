"""Rewrites physical Tailwind direction utilities to logical ones so layouts mirror in RTL.
Only touches class-like tokens (preceded by whitespace, a quote, a backtick, ':' or '!')."""
import re, sys, pathlib

B = r"(?<=[\s\"'`:!])"
RULES = [
    (rf"{B}(-?)ml-", r"\1ms-"), (rf"{B}(-?)mr-", r"\1me-"),
    (rf"{B}(-?)pl-", r"\1ps-"), (rf"{B}(-?)pr-", r"\1pe-"),
    # Centering tricks (left-1/2 + -translate-x-1/2) must stay physical.
    (rf"{B}(-?)left-(?!1/2)", r"\1start-"), (rf"{B}(-?)right-(?!1/2)", r"\1end-"),
    (rf"{B}text-left\b", "text-start"), (rf"{B}text-right\b", "text-end"),
    (rf"{B}border-l(?=[\s\"'`-]|$)", "border-s"), (rf"{B}border-r(?=[\s\"'`-]|$)", "border-e"),
    (rf"{B}rounded-tl(?=[\s\"'`-]|$)", "rounded-ss"), (rf"{B}rounded-tr(?=[\s\"'`-]|$)", "rounded-se"),
    (rf"{B}rounded-bl(?=[\s\"'`-]|$)", "rounded-es"), (rf"{B}rounded-br(?=[\s\"'`-]|$)", "rounded-ee"),
    (rf"{B}rounded-l(?=[\s\"'`-]|$)", "rounded-s"), (rf"{B}rounded-r(?=[\s\"'`-]|$)", "rounded-e"),
]
total = 0
for path in sys.argv[1:]:
    p = pathlib.Path(path)
    src = p.read_text()
    out = src
    for pat, rep in RULES:
        out, n = re.subn(pat, rep, out)
        total += n
    if out != src:
        p.write_text(out)
print(f"{total} replacements")
