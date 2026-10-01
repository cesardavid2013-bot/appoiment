"use client";

import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge } from "@/components/ui/misc";
import { slugify } from "@/domain/slugs";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

export type AdminCategory = {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  keywords: string[];
  isActive: boolean;
  usage: { businesses: number; services: number; campaigns: number; children: number };
  children?: AdminCategory[];
};

type FormState = { name: string; slug: string; description: string; keywords: string; parentId: string; isActive: boolean };

const inUse = (c: AdminCategory) => c.usage.businesses + c.usage.services + c.usage.campaigns + c.usage.children > 0;

function usageText(c: AdminCategory) {
  const parts = [
    c.usage.businesses && `${c.usage.businesses} business${c.usage.businesses === 1 ? "" : "es"}`,
    c.usage.services && `${c.usage.services} service${c.usage.services === 1 ? "" : "s"}`,
    c.usage.campaigns && `${c.usage.campaigns} campaign${c.usage.campaigns === 1 ? "" : "s"}`,
  ].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return c.usage.children ? "No direct listings" : "Unused";
}

export function CategoryManager({ tree }: { tree: AdminCategory[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const [form, setForm] = useState<FormState>({ name: "", slug: "", description: "", keywords: "", parentId: "", isActive: true });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ kind: "delete" | "deactivate"; c: AdminCategory } | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const topLevel = tree.filter((c) => !c.parentId);

  function openForm(c: AdminCategory | "new", parentId = "") {
    setEditing(c);
    setError(null);
    setFields({});
    setSlugTouched(c !== "new");
    setForm(
      c === "new"
        ? { name: "", slug: "", description: "", keywords: "", parentId, isActive: true }
        : { name: c.name, slug: c.slug, description: c.description ?? "", keywords: c.keywords.join(", "), parentId: c.parentId ?? "", isActive: c.isActive },
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    setFields({});
    const body = {
      name: form.name,
      slug: form.slug,
      description: form.description || null,
      keywords: form.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      parentId: form.parentId || null,
      isActive: form.isActive,
    };
    try {
      if (editing === "new") await api("/api/admin/categories", { body });
      else await api(`/api/admin/categories/${editing.id}`, { method: "PATCH", body });
      toast.success(editing === "new" ? "Category created" : "Category saved");
      setEditing(null);
      router.refresh();
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.message);
      if (e2.fields) setFields(e2.fields);
    } finally {
      setBusy(false);
    }
  }

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setPending(key);
    try {
      await fn();
      toast.success(success);
      router.refresh();
      return true;
    } catch (err) {
      toast.error((err as ApiError).message);
      return false;
    } finally {
      setPending(null);
    }
  }

  const move = (c: AdminCategory, direction: "up" | "down") => run(`${c.id}:${direction}`, () => api(`/api/admin/categories/${c.id}/move`, { body: { direction } }), "Order updated");
  const setActive = (c: AdminCategory, isActive: boolean) => run(`${c.id}:active`, () => api(`/api/admin/categories/${c.id}/active`, { body: { isActive } }), isActive ? "Category activated" : "Category deactivated");

  function renderRow(c: AdminCategory, index: number, siblings: number, child = false) {
    return (
      <li key={c.id} className={cn("flex items-start gap-3 px-4 py-3", child && "bg-bg/60 pl-8 sm:pl-12")}>
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={() => move(c, "up")}
            disabled={index === 0 || pending !== null}
            className="flex size-6 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30"
            aria-label={`Move ${c.name} up`}
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => move(c, "down")}
            disabled={index === siblings - 1 || pending !== null}
            className="flex size-6 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30"
            aria-label={`Move ${c.name} down`}
          >
            <ArrowDown className="size-3.5" />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-sm font-medium", c.isActive ? "text-ink" : "text-ink-3 line-through")}>{c.name}</span>
            <span className="font-mono text-[12px] text-ink-3">{c.slug}</span>
            {!c.isActive && <Badge tone="attention">Inactive</Badge>}
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {usageText(c)}
            {!child && c.usage.children > 0 && ` · ${c.usage.children} subcategor${c.usage.children === 1 ? "y" : "ies"}`}
          </p>
          {c.keywords.length > 0 && (
            <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-2">
              <span className="text-ink-3">Keywords: </span>
              {c.keywords.join(", ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => openForm(c)} className="hidden sm:inline-flex">
            Edit
          </Button>
          <Menu>
            <MenuTrigger className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`More actions for ${c.name}`}>
              <MoreHorizontal className="size-4" />
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<Pencil />} onSelect={() => openForm(c)}>
                Edit
              </MenuItem>
              {!child && (
                <MenuItem icon={<Plus />} onSelect={() => openForm("new", c.id)}>
                  Add subcategory
                </MenuItem>
              )}
              <MenuSeparator />
              {c.isActive ? (
                <MenuItem icon={<Power />} onSelect={() => setConfirm({ kind: "deactivate", c })}>
                  Deactivate
                </MenuItem>
              ) : (
                <MenuItem icon={<Power />} onSelect={() => setActive(c, true)}>
                  Activate
                </MenuItem>
              )}
              {!inUse(c) && (
                <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirm({ kind: "delete", c })}>
                  Delete
                </MenuItem>
              )}
            </MenuContent>
          </Menu>
        </div>
      </li>
    );
  }

  const editingHasChildren = editing && editing !== "new" ? editing.usage.children > 0 : false;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button icon={<Plus className="size-4" />} onClick={() => openForm("new")} size="sm">
          New category
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <ul className="divide-y divide-line" aria-label="Categories">
          {tree.map((c, i) => (
            <li key={c.id}>
              <ul className="divide-y divide-line">
                {renderRow(c, i, tree.length)}
                {(c.children ?? []).map((k, j) => renderRow(k, j, c.children!.length, true))}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !busy && !o && setEditing(null)}
        title={editing === "new" ? "New category" : "Edit category"}
        description="Names and keywords feed search. Changes are re-indexed for affected businesses."
        locked={busy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="category-form" loading={busy}>
              {editing === "new" ? "Create category" : "Save changes"}
            </Button>
          </>
        }
      >
        <form id="category-form" onSubmit={save} className="space-y-4 pt-1" noValidate>
          <FormError message={error} />
          <Field label="Name" error={fields.name}>
            {(p) => (
              <Input
                {...p}
                value={form.name}
                maxLength={60}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
                }}
              />
            )}
          </Field>
          <Field label="Slug" error={fields.slug} hint="Lowercase letters, numbers and hyphens. Used in URLs like /explore?category=…">
            {(p) => (
              <Input
                {...p}
                value={form.slug}
                maxLength={50}
                className="font-mono"
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }));
                }}
              />
            )}
          </Field>
          <Field label="Parent" error={fields.parentId} hint={editingHasChildren ? "This category has subcategories, so it stays top-level." : "Categories nest one level deep."}>
            {(p) => (
              <Select {...p} value={form.parentId} disabled={editingHasChildren} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
                <option value="">None (top-level)</option>
                {topLevel
                  .filter((c) => editing === "new" || c.id !== editing?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Keywords" optional error={fields.keywords} hint="Comma-separated search synonyms, e.g. fade, taper, beard trim.">
            {(p) => <Textarea {...p} rows={2} value={form.keywords} onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))} />}
          </Field>
          <Field label="Description" optional error={fields.description}>
            {(p) => <Textarea {...p} rows={2} maxLength={300} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}
          </Field>
          <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} label="Active" description="Inactive categories are hidden from browsing and search suggestions." />
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && pending === null && setConfirm(null)}
        title={confirm?.kind === "delete" ? `Delete “${confirm.c.name}”?` : `Deactivate “${confirm?.c.name ?? ""}”?`}
        description={
          confirm?.kind === "delete"
            ? "Nothing uses this category, so it can be deleted permanently."
            : confirm && inUse(confirm.c)
              ? `It stays attached to ${usageText(confirm.c).toLowerCase()} but disappears from browsing and suggestions.`
              : "It disappears from browsing and suggestions. You can activate it again at any time."
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete" : "Deactivate"}
        loading={pending !== null}
        onConfirm={async () => {
          if (!confirm) return;
          const ok =
            confirm.kind === "delete"
              ? await run(`${confirm.c.id}:delete`, () => api(`/api/admin/categories/${confirm.c.id}`, { method: "DELETE" }), "Category deleted")
              : await setActive(confirm.c, false);
          if (ok) setConfirm(null);
        }}
      />
    </>
  );
}
