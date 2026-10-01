import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { AddressBook } from "@/components/account/address-book";
import { MAX_SAVED_ADDRESSES } from "@/domain/account";
import { listAddresses } from "@/server/services/account";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Saved addresses", robots: { index: false } };

const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "ZZ", "QO", "XA", "XB", "AQ"]);

/** ISO 3166 regions the runtime can name, sorted by display name. */
function countryOptions() {
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  const out: { code: string; name: string }[] = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code)) continue;
      const name = names.of(code);
      if (name && name !== code) out.push({ code, name });
    }
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

export default async function AddressesPage() {
  const viewer = await requireViewerPage("/account/addresses");
  const items = await listAddresses(viewer.id);
  return (
    <AccountShell title="Saved addresses" description="For mobile professionals who come to you — barbers, detailers, trainers and more.">
      <AddressBook initial={items} countries={countryOptions()} max={MAX_SAVED_ADDRESSES} />
    </AccountShell>
  );
}
