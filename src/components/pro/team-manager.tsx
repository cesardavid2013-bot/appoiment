"use client";

import { Camera, Check, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceCard, Switch } from "@/components/ui/controls";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import { Avatar, type MediaLike } from "@/components/ui/media";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, PageHeader } from "@/components/ui/misc";
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, type MemberRole, type Permission } from "@/domain/permissions";
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";
import type { TFunction } from "@/i18n/translate";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { uploadMedia } from "@/lib/upload";

type Member = {
  id: string;
  name: string;
  title: string | null;
  bio: string | null;
  role: MemberRole;
  customPermissions: string[];
  status: "invited" | "active" | "disabled";
  isBookable: boolean;
  color: string | null;
  commissionBps: number | null;
  email: string | null;
  inviteExpiresAt: string | null;
  joinedAt: string | null;
  upcoming: number;
  locationIds: string[];
  avatarMediaId: string | null;
  avatar: MediaLike | null;
};

type Props = {
  now: number;
  businessId: string;
  selfMemberId: string;
  assignable: MemberRole[];
  plan: { label: string; maxBookable: number; customRoles: boolean };
  locations: { id: string; name: string }[];
  members: Member[];
};

/** Calendar colours: distinguishable on the calendar, readable with white text. */
const COLORS = ["#2e5e4e", "#3d5a80", "#7a4b8c", "#a0522d", "#8a6d1f", "#5b6b2f", "#9c3d54", "#40666a"];

/** Looks up a translation, falling back to the English domain constant when the key is missing. */
function tOr(t: TFunction, key: string, fallback: string) {
  const v = t(key);
  return v === key ? fallback : v;
}
const roleLabel = (t: TFunction, r: MemberRole) => tOr(t, `account.invite.roles.${r}.label`, ROLE_LABELS[r].label);
const roleDescription = (t: TFunction, r: MemberRole) => tOr(t, `account.invite.roles.${r}.description`, ROLE_LABELS[r].description);
const permissionLabel = (t: TFunction, p: Permission) => tOr(t, `proSetup.team.permissions.${p}`, PERMISSIONS[p]);

export function TeamManager(props: Props) {
  const t = useT("proSetup");
  const tr = useT();
  const router = useRouter();
  const { members, selfMemberId, plan, now } = props;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);

  const current = members.filter((m) => m.status !== "disabled");
  const removed = members.filter((m) => m.status === "disabled");
  const bookableSeats = current.filter((m) => m.isBookable).length;
  const canInvite = props.assignable.length > 0;

  async function resend(m: Member) {
    try {
      await api(`/api/pro/team/${m.id}/resend`, { body: {} });
      toast.success(t("team.resent", { email: m.email ?? "" }));
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await api<{ upcomingAppointments: number }>(`/api/pro/team/${removing.id}`, { method: "DELETE" });
      toast.success(removing.status === "invited" ? t("team.inviteCancelled") : t("team.removed", { name: removing.name }), {
        description: res.upcomingAppointments ? t("team.removedUpcoming", { count: res.upcomingAppointments }) : undefined,
      });
      setRemoving(null);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("team.title")}
        description={t("team.description")}
        actions={
          canInvite && (
            <Button onClick={() => setInviteOpen(true)} icon={<Plus className="size-4" />}>
              {t("team.invite")}
            </Button>
          )
        }
      />

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="text-ink-2">
          {rich(t("team.headcount", { people: current.length, bookable: bookableSeats }), { b: (c) => <span className="font-medium text-ink tabular">{c}</span> })}
        </p>
        <p className="text-ink-3 tabular">
          {t("team.seats", { plan: plan.label, used: bookableSeats, count: plan.maxBookable })}
        </p>
      </div>

      <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
        {current.map((m) => {
          const self = m.id === selfMemberId;
          const days = m.inviteExpiresAt ? Math.ceil((Date.parse(m.inviteExpiresAt) - now) / 86_400_000) : null;
          return (
            <li key={m.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <button type="button" onClick={() => setEditing(m)} className="flex min-w-0 flex-1 items-center gap-3 text-start" aria-label={t("team.editMember", { name: m.name })}>
                <span className="relative shrink-0">
                  <Avatar name={m.name} media={m.avatar} size={44} className={m.status === "invited" ? "opacity-60" : undefined} />
                  {m.color && <span className="absolute -bottom-0.5 -end-0.5 size-3.5 rounded-full border-2 border-surface" style={{ background: m.color }} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-[15px] font-medium text-ink">
                      {m.name}
                      {self && <span className="font-normal text-ink-3"> {t("team.you")}</span>}
                    </span>
                    <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{roleLabel(tr, m.role)}</Badge>
                    {m.status === "invited" && <Badge tone={days != null && days <= 0 ? "negative" : "attention"}>{days != null && days <= 0 ? t("team.inviteExpired") : t("team.invited")}</Badge>}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                    {m.status === "invited" ? `${m.email}${days != null && days > 0 ? ` · ${t("team.expiresIn", { count: days })}` : ""}` : [m.title, m.isBookable ? (m.upcoming ? t("team.upcoming", { count: m.upcoming }) : t("team.takesBookings")) : t("team.noBookings")].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <ChevronRight className="hidden size-4 shrink-0 text-ink-3 sm:block" aria-hidden />
              </button>
              {self || m.role === "owner" ? (
                <span className="size-10 shrink-0" aria-hidden />
              ) : (
                <Menu>
                  <MenuTrigger className="flex size-10 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={t("team.actionsFor", { name: m.name })}>
                    <MoreHorizontal className="size-4" />
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => setEditing(m)}>{t("team.editAction")}</MenuItem>
                    {m.status === "invited" && <MenuItem onSelect={() => resend(m)}>{t("team.resend")}</MenuItem>}
                    <MenuSeparator />
                    <MenuItem danger onSelect={() => setRemoving(m)}>
                      {m.status === "invited" ? t("team.cancelInvite") : t("team.removeFromTeam")}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
            </li>
          );
        })}
      </ul>

      {removed.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowRemoved((v) => !v)} className="text-sm font-medium text-ink-3 hover:text-ink" aria-expanded={showRemoved}>
            {t(showRemoved ? "team.hideFormer" : "team.showFormer", { count: removed.length })}
          </button>
          {showRemoved && (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
              {removed.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-ink-3">
                  <Avatar name={m.name} media={m.avatar} size={28} className="opacity-60" />
                  <span className="flex-1 truncate">{m.name}</span>
                  <span className="text-[13px]">{t("team.noAccess")}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[13px] text-ink-3">{t("team.formerNote")}</p>
        </div>
      )}

      <RoleMatrix />

      {canInvite && <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} assignable={props.assignable} plan={plan} seatsFull={bookableSeats >= plan.maxBookable} />}
      {editing && <EditMemberDialog key={editing.id} member={editing} onClose={() => setEditing(null)} self={editing.id === selfMemberId} {...props} seatsFull={bookableSeats >= plan.maxBookable} />}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing?.status === "invited" ? t("team.cancelInviteTitle", { name: removing?.name ?? "" }) : t("team.removeTitle", { name: removing?.name ?? "" })}
        description={
          removing?.status === "invited"
            ? t("team.cancelInviteBody")
            : removing?.upcoming
              ? `${t("team.removeBody")} ${t("team.removeBodyUpcoming", { count: removing.upcoming })}`
              : t("team.removeBody")
        }
        confirmLabel={removing?.status === "invited" ? t("team.cancelInvite") : t("team.remove")}
        onConfirm={remove}
        loading={busy}
      />
    </>
  );
}

function RoleMatrix() {
  const t = useT("proSetup");
  const tr = useT();
  const roles = ["owner", "manager", "receptionist", "provider"] as const;
  return (
    <details className="group mt-12 rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[15px] font-medium text-ink">
        {t("team.matrix.title")}
        <ChevronRight className="size-4 text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <div className="relative overflow-x-auto border-t border-line">
        <table className="w-full min-w-[560px] text-start text-[13px]">
          <thead>
            <tr className="border-b border-line text-ink-3">
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("team.matrix.permission")}
              </th>
              {roles.map((r) => (
                <th key={r} scope="col" className="w-24 px-2 py-2.5 text-center font-medium">
                  {roleLabel(tr, r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ALL_PERMISSIONS.map((p) => (
              <tr key={p}>
                <th scope="row" className="px-4 py-2 font-normal text-ink-2">
                  {permissionLabel(tr, p)}
                </th>
                {roles.map((r) => (
                  <td key={r} className="px-2 py-2 text-center">
                    {ROLE_PERMISSIONS[r].includes(p) ? <Check className="mx-auto size-4 text-accent" aria-label={t("team.matrix.yes")} /> : <span className="text-ink-3" aria-label={t("team.matrix.no")}>–</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function RolePicker({ value, onChange, assignable, customAllowed }: { value: MemberRole; onChange: (r: MemberRole) => void; assignable: MemberRole[]; customAllowed: boolean }) {
  const t = useT("proSetup");
  const tr = useT();
  return (
    <div className="grid gap-2" role="radiogroup" aria-label={t("team.role")}>
      {assignable.map((r) => (
        <ChoiceCard
          key={r}
          selected={value === r}
          onClick={() => onChange(r)}
          disabled={r === "custom" && !customAllowed}
          title={roleLabel(tr, r)}
          description={r === "custom" && !customAllowed ? t("team.customUpgrade") : roleDescription(tr, r)}
        />
      ))}
    </div>
  );
}

function PermissionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useT("proSetup");
  const tr = useT();
  return (
    <fieldset className="space-y-1 rounded-lg border border-line p-3">
      <legend className="px-1 text-[13px] font-medium text-ink-2">{t("team.allowedTo")}</legend>
      {ALL_PERMISSIONS.filter((p) => p !== "team.manage").map((p: Permission) => (
        <Checkbox key={p} checked={value.includes(p)} onCheckedChange={(c) => onChange(c ? [...value, p] : value.filter((x) => x !== p))} label={permissionLabel(tr, p)} />
      ))}
    </fieldset>
  );
}

function InviteDialog({ open, onOpenChange, assignable, plan, seatsFull }: { open: boolean; onOpenChange: (o: boolean) => void; assignable: MemberRole[]; plan: Props["plan"]; seatsFull: boolean }) {
  const t = useT("proSetup");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<MemberRole>("provider");
  const [perms, setPerms] = useState<string[]>(["appointments.manage_own", "schedule.manage_own"]);
  const [bookable, setBookable] = useState(!seatsFull);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function send() {
    setSaving(true);
    setError(null);
    setErrors({});
    try {
      await api("/api/pro/team", { body: { email, displayName: name, title: title.trim() || null, role, customPermissions: role === "custom" ? perms : [], isBookable: bookable } });
      toast.success(t("team.inviteDialog.sent", { email }), { description: t("team.inviteDialog.sentBody") });
      onOpenChange(false);
      setEmail("");
      setName("");
      setTitle("");
      router.refresh();
    } catch (err) {
      const e = err as ApiError;
      setErrors(e.fields ?? {});
      setError(e.fields ? null : e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("team.invite")}
      description={t("team.inviteDialog.description")}
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("team.cancel")}
          </Button>
          <Button onClick={send} loading={saving}>
            {t("team.inviteDialog.send")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("team.fields.name")} error={errors.displayName}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={80} />}
          </Field>
          <Field label={t("team.fields.jobTitle")} optional>
            {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("team.fields.jobTitlePlaceholder")} maxLength={60} />}
          </Field>
        </div>
        <Field label={t("team.fields.email")} error={errors.email}>
          {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" inputMode="email" />}
        </Field>
        <Field label={t("team.role")}>{() => <RolePicker value={role} onChange={setRole} assignable={assignable} customAllowed={plan.customRoles} />}</Field>
        {role === "custom" && <PermissionPicker value={perms} onChange={setPerms} />}
        <Switch
          checked={bookable}
          onCheckedChange={setBookable}
          disabled={seatsFull && !bookable}
          label={t("team.fields.bookable")}
          description={seatsFull && !bookable ? t("team.fields.seatsFull", { count: plan.maxBookable, plan: plan.label }) : t("team.fields.bookableHintInvite")}
        />
      </div>
    </Dialog>
  );
}

function EditMemberDialog({ member, onClose, self, assignable, plan, locations, businessId, seatsFull }: Props & { member: Member; onClose: () => void; self: boolean; seatsFull: boolean }) {
  const t = useT("proSetup");
  const router = useRouter();
  const [v, setV] = useState({
    displayName: member.name,
    title: member.title ?? "",
    bio: member.bio ?? "",
    role: member.role,
    customPermissions: member.customPermissions,
    isBookable: member.isBookable,
    color: member.color,
    commission: member.commissionBps != null ? String(member.commissionBps / 100) : "",
    locationIds: member.locationIds,
    avatarMediaId: member.avatarMediaId,
  });
  const [avatar, setAvatar] = useState(member.avatar);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canRole = !self && member.role !== "owner" && assignable.length > 0;
  const invited = member.status === "invited";

  async function onPhoto(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadMedia(file, { purpose: "avatar", businessId, alt: member.name });
      setAvatar(res.media);
      setV((s) => ({ ...s, avatarMediaId: res.id }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setError(null);
    const commissionBps = v.commission.trim() === "" ? null : Math.round(Number(v.commission) * 100);
    if (commissionBps != null && (!Number.isFinite(commissionBps) || commissionBps < 0 || commissionBps > 10_000)) return setError(t("team.edit.commissionError"));
    setSaving(true);
    try {
      await api(`/api/pro/team/${member.id}`, {
        method: "PUT",
        body: {
          displayName: v.displayName,
          title: v.title.trim() || null,
          bio: v.bio.trim() || null,
          ...(canRole ? { role: v.role, customPermissions: v.role === "custom" ? v.customPermissions : undefined } : {}),
          isBookable: v.isBookable,
          color: v.color,
          commissionBps,
          ...(locations.length > 1 ? { locationIds: v.locationIds } : {}),
          avatarMediaId: v.avatarMediaId,
        },
      });
      toast.success(t("team.edit.saved"));
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={self ? t("team.edit.yourProfile") : member.name}
      description={invited ? t("team.edit.pending", { email: member.email ?? "" }) : member.email ?? undefined}
      size="lg"
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("team.cancel")}
          </Button>
          <Button onClick={save} loading={saving} disabled={uploading}>
            {t("team.edit.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <FormError message={error} />
        <div className="flex items-center gap-4">
          <Avatar name={v.displayName || member.name} media={avatar} size={64} />
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-2 focus-within:ring-3 focus-within:ring-accent/15">
            <Camera className="size-4" /> {uploading ? t("team.edit.uploading") : avatar ? t("team.edit.changePhoto") : t("team.edit.addPhoto")}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} disabled={uploading} />
          </label>
          {avatar && (
            <button
              type="button"
              className="text-sm text-ink-3 hover:text-danger"
              onClick={() => {
                setAvatar(null);
                setV((s) => ({ ...s, avatarMediaId: null }));
              }}
            >
              {t("team.remove")}
            </button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("team.fields.publicName")}>{(p) => <Input {...p} value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} maxLength={80} />}</Field>
          <Field label={t("team.fields.jobTitle")} optional>
            {(p) => <Input {...p} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={60} />}
          </Field>
        </div>
        <Field label={t("team.fields.bio")} optional hint={t("team.fields.bioHint")}>
          {(p) => <Textarea {...p} rows={3} value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} maxLength={1000} />}
        </Field>
        <Switch
          checked={v.isBookable}
          onCheckedChange={(b) => setV({ ...v, isBookable: b })}
          disabled={!member.isBookable && seatsFull}
          label={t("team.fields.bookable")}
          description={!member.isBookable && seatsFull ? t("team.fields.seatsFull", { count: plan.maxBookable, plan: plan.label }) : t("team.fields.bookableHintEdit")}
        />
        <Field label={t("team.fields.color")} optional>
          {() => (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("team.fields.color")}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={v.color === c}
                  aria-label={c}
                  onClick={() => setV({ ...v, color: v.color === c ? null : c })}
                  className={cn("flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-surface", v.color === c && "ring-2 ring-ink")}
                  style={{ background: c }}
                >
                  {v.color === c && <Check className="size-4 text-white" />}
                </button>
              ))}
            </div>
          )}
        </Field>
        {locations.length > 1 && (
          <Field label={t("team.fields.worksAt")} hint={t("team.fields.worksAtHint")}>
            {() => (
              <div className="space-y-1">
                {locations.map((l) => (
                  <Checkbox key={l.id} checked={v.locationIds.includes(l.id)} onCheckedChange={(c) => setV({ ...v, locationIds: c ? [...v.locationIds, l.id] : v.locationIds.filter((x) => x !== l.id) })} label={l.name} />
                ))}
              </div>
            )}
          </Field>
        )}
        {!self && (
          <Field label={t("team.fields.commission")} optional hint={t("team.fields.commissionHint")}>
            {(p) => (
              <div className="flex items-center gap-2">
                <Input {...p} inputMode="decimal" value={v.commission} onChange={(e) => setV({ ...v, commission: e.target.value })} className="w-24" placeholder="0" />
                <span className="text-sm text-ink-3">{t("team.fields.commissionSuffix")}</span>
              </div>
            )}
          </Field>
        )}
        {canRole && (
          <>
            <Field label={t("team.role")}>{() => <RolePicker value={v.role} onChange={(r) => setV({ ...v, role: r })} assignable={assignable} customAllowed={plan.customRoles} />}</Field>
            {v.role === "custom" && <PermissionPicker value={v.customPermissions} onChange={(p) => setV({ ...v, customPermissions: p })} />}
          </>
        )}
      </div>
    </Dialog>
  );
}
