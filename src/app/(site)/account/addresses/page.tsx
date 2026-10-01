import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { AddressBook } from "@/components/account/address-book";
import { MAX_SAVED_ADDRESSES } from "@/domain/account";
import { getI18n, getT } from "@/i18n/server";
import { listAddresses } from "@/server/services/account";
import { requireViewerPage } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("account");
  return { title: t("sections.addresses.label"), robots: { index: false } };
}

const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "ZZ", "QO", "XA", "XB", "AQ"]);

/** ISO 3166 regions the runtime can name, sorted by display name. */
function countryOptions(intl: string) {
  const names = new Intl.DisplayNames([intl, "en"], { type: "region", fallback: "none" });
  const out: { code: string; name: string }[] = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code)) continue;
      const name = names.of(code);
      if (name && name !== code) out.push({ code, name });
    }
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, intl));
}

export default async function AddressesPage() {
  const viewer = await requireViewerPage("/account/addresses");
  const [items, t, { intl }] = await Promise.all([listAddresses(viewer.id), getT("account"), getI18n()]);
  return (
    <AccountShell title={t("sections.addresses.label")} description={t("addresses.description")}>
      <AddressBook initial={items} countries={countryOptions(intl)} max={MAX_SAVED_ADDRESSES} />
    </AccountShell>
  );
}
