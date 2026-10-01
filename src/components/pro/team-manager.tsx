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

export function TeamManager(props: Props) {
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
      toast.success(`New invitation sent to ${m.email}`);
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
      toast.success(removing.status === "invited" ? "Invitation cancelled" : `${removing.name} no longer has access`, {
        description: res.upcomingAppointments ? `They still have ${res.upcomingAppointments} upcoming appointment${res.upcomingAppointments === 1 ? "" : "s"} — reassign or cancel them from the calendar.` : undefined,
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
        title="Team"
        description="Who works here, what they can see, and who customers can book."
        actions={
          canInvite && (
            <Button onClick={() => setInviteOpen(true)} icon={<Plus className="size-4" />}>
              Invite someone
            </Button>
          )
        }
      />

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="text-ink-2">
          <span className="font-medium text-ink tabular">{current.length}</span> {current.length === 1 ? "person" : "people"} ·{" "}
          <span className="font-medium text-ink tabular">{bookableSeats}</span> {bookableSeats === 1 ? "takes" : "take"} bookings
        </p>
        <p className="text-ink-3 tabular">
          {plan.label} plan: {bookableSeats} of {plan.maxBookable} bookable {plan.maxBookable === 1 ? "seat" : "seats"} used
        </p>
      </div>

      <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
        {current.map((m) => {
          const self = m.id === selfMemberId;
          const days = m.inviteExpiresAt ? Math.ceil((Date.parse(m.inviteExpiresAt) - now) / 86_400_000) : null;
          return (
            <li key={m.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <button type="button" onClick={() => setEditing(m)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Edit ${m.name}`}>
                <span className="relative shrink-0">
                  <Avatar name={m.name} media={m.avatar} size={44} className={m.status === "invited" ? "opacity-60" : undefined} />
                  {m.color && <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-surface" style={{ background: m.color }} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-[15px] font-medium text-ink">
                      {m.name}
                      {self && <span className="font-normal text-ink-3"> (you)</span>}
                    </span>
                    <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{ROLE_LABELS[m.role].label}</Badge>
                    {m.status === "invited" && <Badge tone={days != null && days <= 0 ? "negative" : "attention"}>{days != null && days <= 0 ? "Invite expired" : "Invited"}</Badge>}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                    {m.status === "invited" ? `${m.email}${days != null && days > 0 ? ` · expires in ${days} ${days === 1 ? "day" : "days"}` : ""}` : [m.title, m.isBookable ? (m.upcoming ? `${m.upcoming} upcoming` : "Takes bookings") : "Doesn't take bookings"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <ChevronRight className="hidden size-4 shrink-0 text-ink-3 sm:block" aria-hidden />
              </button>
              {self || m.role === "owner" ? (
                <span className="size-10 shrink-0" aria-hidden />
              ) : (
                <Menu>
                  <MenuTrigger className="flex size-10 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Actions for ${m.name}`}>
                    <MoreHorizontal className="size-4" />
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => setEditing(m)}>Edit</MenuItem>
                    {m.status === "invited" && <MenuItem onSelect={() => resend(m)}>Send a new invite link</MenuItem>}
                    <MenuSeparator />
                    <MenuItem danger onSelect={() => setRemoving(m)}>
                      {m.status === "invited" ? "Cancel invitation" : "Remove from team"}
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
            {showRemoved ? "Hide" : "Show"} {removed.length} former {removed.length === 1 ? "member" : "members"}
          </button>
          {showRemoved && (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
              {removed.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-ink-3">
                  <Avatar name={m.name} media={m.avatar} size={28} className="opacity-60" />
                  <span className="flex-1 truncate">{m.name}</span>
                  <span className="text-[13px]">No access</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[13px] text-ink-3">Former members keep their past appointments in your records. To bring someone back, invite them again.</p>
        </div>
      )}

      <RoleMatrix />

      {canInvite && <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} assignable={props.assignable} plan={plan} seatsFull={bookableSeats >= plan.maxBookable} />}
      {editing && <EditMemberDialog key={editing.id} member={editing} onClose={() => setEditing(null)} self={editing.id === selfMemberId} {...props} seatsFull={bookableSeats >= plan.maxBookable} />}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing?.status === "invited" ? `Cancel ${removing?.name}'s invitation?` : `Remove ${removing?.name} from the team?`}
        description={
          removing?.status === "invited"
            ? "The invite link stops working immediately."
            : `They lose access right away and stop appearing on your profile. Their past appointments stay in your records.${removing?.upcoming ? ` They have ${removing.upcoming} upcoming appointment${removing.upcoming === 1 ? "" : "s"} you'll need to reassign or cancel.` : ""}`
        }
        confirmLabel={removing?.status === "invited" ? "Cancel invitation" : "Remove"}
        onConfirm={remove}
        loading={busy}
      />
    </>
  );
}

function RoleMatrix() {
  const roles = ["owner", "manager", "receptionist", "provider"] as const;
  return (
    <details className="group mt-12 rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[15px] font-medium text-ink">
        What each role can do
        <ChevronRight className="size-4 text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <div className="relative overflow-x-auto border-t border-line">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-ink-3">
              <th scope="col" className="px-4 py-2.5 font-medium">
                Permission
              </th>
              {roles.map((r) => (
                <th key={r} scope="col" className="w-24 px-2 py-2.5 text-center font-medium">
                  {ROLE_LABELS[r].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ALL_PERMISSIONS.map((p) => (
              <tr key={p}>
                <th scope="row" className="px-4 py-2 font-normal text-ink-2">
                  {PERMISSIONS[p]}
                </th>
                {roles.map((r) => (
                  <td key={r} className="px-2 py-2 text-center">
                    {ROLE_PERMISSIONS[r].includes(p) ? <Check className="mx-auto size-4 text-accent" aria-label="Yes" /> : <span className="text-ink-3" aria-label="No">–</span>}
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
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Role">
      {assignable.map((r) => (
        <ChoiceCard
          key={r}
          selected={value === r}
          onClick={() => onChange(r)}
          disabled={r === "custom" && !customAllowed}
          title={ROLE_LABELS[r].label}
          description={r === "custom" && !customAllowed ? "Available on Pro and Business plans." : ROLE_LABELS[r].description}
        />
      ))}
    </div>
  );
}

function PermissionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="space-y-1 rounded-lg border border-line p-3">
      <legend className="px-1 text-[13px] font-medium text-ink-2">Allowed to</legend>
      {ALL_PERMISSIONS.filter((p) => p !== "team.manage").map((p: Permission) => (
        <Checkbox key={p} checked={value.includes(p)} onCheckedChange={(c) => onChange(c ? [...value, p] : value.filter((x) => x !== p))} label={PERMISSIONS[p]} />
      ))}
    </fieldset>
  );
}

function InviteDialog({ open, onOpenChange, assignable, plan, seatsFull }: { open: boolean; onOpenChange: (o: boolean) => void; assignable: MemberRole[]; plan: Props["plan"]; seatsFull: boolean }) {
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
      toast.success(`Invitation sent to ${email}`, { description: "The link works for 7 days." });
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
      title="Invite someone"
      description="They'll get an email with a link to join. They sign in with that email address."
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={send} loading={saving}>
            Send invitation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.displayName}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={80} />}
          </Field>
          <Field label="Job title" optional>
            {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior barber" maxLength={60} />}
          </Field>
        </div>
        <Field label="Email" error={errors.email}>
          {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" inputMode="email" />}
        </Field>
        <Field label="Role">{() => <RolePicker value={role} onChange={setRole} assignable={assignable} customAllowed={plan.customRoles} />}</Field>
        {role === "custom" && <PermissionPicker value={perms} onChange={setPerms} />}
        <Switch
          checked={bookable}
          onCheckedChange={setBookable}
          disabled={seatsFull && !bookable}
          label="Customers can book them"
          description={seatsFull && !bookable ? `All ${plan.maxBookable} bookable seats on your ${plan.label} plan are in use.` : "Shows them on your profile once they've set their hours."}
        />
      </div>
    </Dialog>
  );
}

function EditMemberDialog({ member, onClose, self, assignable, plan, locations, businessId, seatsFull }: Props & { member: Member; onClose: () => void; self: boolean; seatsFull: boolean }) {
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
    if (commissionBps != null && (!Number.isFinite(commissionBps) || commissionBps < 0 || commissionBps > 10_000)) return setError("Commission must be between 0 and 100%.");
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
      toast.success("Saved");
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
      title={self ? "Your profile" : member.name}
      description={invited ? `Invitation pending for ${member.email}.` : member.email ?? undefined}
      size="lg"
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={uploading}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <FormError message={error} />
        <div className="flex items-center gap-4">
          <Avatar name={v.displayName || member.name} media={avatar} size={64} />
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-2 focus-within:ring-3 focus-within:ring-accent/15">
            <Camera className="size-4" /> {uploading ? "Uploading…" : avatar ? "Change photo" : "Add photo"}
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
              Remove
            </button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name shown to customers">{(p) => <Input {...p} value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} maxLength={80} />}</Field>
          <Field label="Job title" optional>
            {(p) => <Input {...p} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={60} />}
          </Field>
        </div>
        <Field label="Bio" optional hint="A line or two about their specialties. Shown on your profile.">
          {(p) => <Textarea {...p} rows={3} value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} maxLength={1000} />}
        </Field>
        <Switch
          checked={v.isBookable}
          onCheckedChange={(b) => setV({ ...v, isBookable: b })}
          disabled={!member.isBookable && seatsFull}
          label="Customers can book them"
          description={!member.isBookable && seatsFull ? `All ${plan.maxBookable} bookable seats on your ${plan.label} plan are in use.` : "Turn off for front-desk staff or people on leave."}
        />
        <Field label="Calendar colour" optional>
          {() => (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Calendar colour">
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
          <Field label="Works at" hint="Leave all unchecked if they work at every location.">
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
          <Field label="Commission" optional hint="Used in Insights to estimate what you owe them. Not paid out automatically.">
            {(p) => (
              <div className="flex items-center gap-2">
                <Input {...p} inputMode="decimal" value={v.commission} onChange={(e) => setV({ ...v, commission: e.target.value })} className="w-24" placeholder="0" />
                <span className="text-sm text-ink-3">% of service revenue</span>
              </div>
            )}
          </Field>
        )}
        {canRole && (
          <>
            <Field label="Role">{() => <RolePicker value={v.role} onChange={(r) => setV({ ...v, role: r })} assignable={assignable} customAllowed={plan.customRoles} />}</Field>
            {v.role === "custom" && <PermissionPicker value={v.customPermissions} onChange={(p) => setV({ ...v, customPermissions: p })} />}
          </>
        )}
      </div>
    </Dialog>
  );
}
