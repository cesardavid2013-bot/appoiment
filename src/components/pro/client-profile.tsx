"use client";

import { CalendarPlus, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import { useLocale, useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { useNow } from "@/lib/use-client-time";
import { timeAgo } from "@/lib/format";
import { NewAppointmentDialog } from "./pro-dialogs";

export type ClientData = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  preferences: string | null;
  hasAccount: boolean;
  completedCount: number;
};

export function EditClientButton({ client }: { client: ClientData }) {
  const router = useRouter();
  const t = useT("pro");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [preferences, setPreferences] = useState(client.preferences ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  function openDialog() {
    setName(client.name);
    setEmail(client.email ?? "");
    setPhone(client.phone ?? "");
    setPreferences(client.preferences ?? "");
    setError(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/pro/customers/${client.id}`, { method: "PUT", body: client.hasAccount ? { preferences: preferences.trim() || null } : { name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, preferences: preferences.trim() || null } });
      toast.success(t("client.updated"));
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={openDialog} icon={<Pencil className="size-4" />}>
        {t("client.edit")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("client.editTitle")}
        description={client.hasAccount ? t("client.editHasAccount") : undefined}
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              {t("dialogs.cancel")}
            </Button>
            <Button onClick={save} loading={saving} disabled={!name.trim()}>
              {t("client.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error && !error.fields ? error.message : null} />
          <Field label={t("newAppt.name")} error={error?.fields?.name}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} disabled={client.hasAccount} autoComplete="off" maxLength={80} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("newAppt.phone")} optional error={error?.fields?.phone}>
              {(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={client.hasAccount} autoComplete="off" maxLength={40} />}
            </Field>
            <Field label={t("newAppt.email")} optional error={error?.fields?.email}>
              {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={client.hasAccount} autoComplete="off" maxLength={254} />}
            </Field>
          </div>
          <Field label={t("client.preferences")} optional hint={t("client.preferencesHint")} error={error?.fields?.preferences}>
            {(p) => <Textarea {...p} rows={4} value={preferences} onChange={(e) => setPreferences(e.target.value)} maxLength={2000} />}
          </Field>
        </div>
      </Dialog>
    </>
  );
}

export function BookClientButton({
  client,
  services,
  team,
  timezone,
  canAssignOthers,
  selfMemberId,
}: {
  client: ClientData;
  services: { id: string; name: string; durationMinutes: number }[];
  team: { id: string; name: string }[];
  timezone: string;
  canAssignOthers: boolean;
  selfMemberId: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useT("pro");
  return (
    <>
      <Button onClick={() => setOpen(true)} icon={<CalendarPlus className="size-4" />}>
        {t("client.book")}
      </Button>
      {open && (
        <NewAppointmentDialog
          open={open}
          onOpenChange={setOpen}
          services={services}
          team={team}
          timezone={timezone}
          canAssignOthers={canAssignOthers}
          selfMemberId={selfMemberId}
          initial={{ customer: { id: client.id, name: client.name, email: client.email, phone: client.phone, completedCount: client.completedCount } }}
        />
      )}
    </>
  );
}

/** Inline tag editor: type and press Enter to add, tap × to remove. Saves immediately. */
export function ClientTags({ client, canEdit, suggestions }: { client: ClientData; canEdit: boolean; suggestions: string[] }) {
  const router = useRouter();
  const t = useT("pro");
  const [tags, setTags] = useState(client.tags);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(next: string[]) {
    const prev = tags;
    setTags(next);
    setSaving(true);
    setError(null);
    try {
      await api(`/api/pro/customers/${client.id}`, { method: "PUT", body: { tags: next } });
      router.refresh();
    } catch (err) {
      setTags(prev);
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  function add() {
    const tag = draft.trim().toLowerCase().slice(0, 30);
    if (!tag) return;
    setDraft("");
    if (tags.includes(tag)) return;
    if (tags.length >= 12) {
      setError(t("client.tagLimit", { max: 12 }));
      return;
    }
    void persist([...tags, tag]);
  }

  const unused = suggestions.filter((s) => !tags.includes(s)).slice(0, 6);

  return (
    <div>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("client.tags")}>
          {tags.map((tag) => (
            <li key={tag} className="inline-flex h-7 items-center gap-1 rounded-sm bg-surface-2 ps-2 pe-0.5 text-[13px] text-ink-2">
              {tag}
              {canEdit && (
                <button type="button" onClick={() => persist(tags.filter((x) => x !== tag))} disabled={saving} className="flex size-6 items-center justify-center rounded text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label={t("client.removeTag", { tag })}>
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">{t("client.noTags")}</p>
      )}
      {canEdit && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label htmlFor="tag-input" className="sr-only">
            {t("client.addTag")}
          </label>
          <Input id="tag-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("client.addTagPlaceholder")} maxLength={30} list="tag-suggestions" className="h-10 md:h-9" />
          <datalist id="tag-suggestions">
            {unused.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Button type="submit" variant="secondary" size="sm" className="h-10 md:h-9" disabled={!draft.trim()} loading={saving} icon={<Plus className="size-4" />}>
            {t("client.add")}
          </Button>
        </form>
      )}
      {error && (
        <p className="mt-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Note = { id: string; body: string; createdAt: string; author: string | null; authorUserId: string };

export function ClientNotes({ clientId, notes, canAdd, canDeleteAll, viewerId, serverNow }: { clientId: string; notes: Note[]; canAdd: boolean; canDeleteAll: boolean; viewerId: string; serverNow: number }) {
  const router = useRouter();
  const t = useT("pro");
  const { intl } = useLocale();
  const now = useNow(serverNow);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function add() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/pro/customers/${clientId}/notes`, { body: { body } });
      setBody("");
      toast.success(t("client.noteAdded"));
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api(`/api/pro/notes/${confirm.id}`, { method: "DELETE" });
      toast.success(t("client.noteDeleted"));
      setConfirm(null);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section aria-labelledby="notes-h">
      <h2 id="notes-h" className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
        {t("appointment.privateNotes")} <Lock className="size-3.5 text-ink-3" aria-hidden />
      </h2>
      <p className="mt-0.5 text-[12px] text-ink-3">{t("client.notesHint")}</p>
      {canAdd && (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) void add();
          }}
        >
          <label htmlFor="note-body" className="sr-only">
            {t("client.newNote")}
          </label>
          <Textarea
            id="note-body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) {
                e.preventDefault();
                void add();
              }
            }}
            placeholder={t("client.notePlaceholder")}
            maxLength={2000}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[12px] text-danger" role="alert">
              {error}
            </p>
            <Button type="submit" size="sm" loading={saving} disabled={!body.trim()}>
              {t("client.addNote")}
            </Button>
          </div>
        </form>
      )}
      {notes.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">{canAdd ? t("client.noNotes") : t("client.noNotesReadOnly")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {notes.map((n) => (
            <li key={n.id} className="group py-3">
              <p className="whitespace-pre-line break-words text-sm leading-relaxed text-ink">{n.body}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-[12px] text-ink-3">
                  {n.author ?? t("client.formerMember")} · <time dateTime={n.createdAt}>{timeAgo(n.createdAt, now, intl)}</time>
                </p>
                {(canDeleteAll || n.authorUserId === viewerId) && (
                  <button type="button" onClick={() => setConfirm(n)} className="flex size-8 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-danger" aria-label={t("client.deleteNote")}>
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)} title={t("client.deleteNoteTitle")} description={t("client.deleteNoteBody")} confirmLabel={t("client.deleteNote")} onConfirm={remove} loading={deleting} />
    </section>
  );
}
