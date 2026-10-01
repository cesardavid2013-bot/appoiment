"use client";

import { Camera, LocateFixed, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { Avatar, type MediaLike } from "@/components/ui/media";
import { api, ApiError } from "@/lib/api";
import { uploadMedia } from "@/lib/upload";
import { SettingsCard } from "./account-shell";

type Props = {
  initial: { name: string; email: string | null; phone: string | null; timezone: string | null; avatar: MediaLike | null };
  zones: { value: string; label: string }[];
  smsEnabled: boolean;
};

export function ProfileForm({ initial, zones, smsEnabled }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState(initial.avatar);
  const [photoBusy, setPhotoBusy] = useState<"upload" | "remove" | null>(null);
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [timezone, setTimezone] = useState(initial.timezone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const dirty = name.trim() !== initial.name || phone.trim() !== (initial.phone ?? "") || timezone !== (initial.timezone ?? "");

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy("upload");
    try {
      const up = await uploadMedia(file, "avatar", { alt: name });
      await api("/api/me/profile", { method: "PATCH", body: { avatarMediaId: up.id } });
      setAvatar(up.media);
      toast.success("Photo updated");
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setPhotoBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    setPhotoBusy("remove");
    try {
      await api("/api/me/profile", { method: "PATCH", body: { avatarMediaId: null } });
      setAvatar(null);
      toast.success("Photo removed");
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setPhotoBusy(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    try {
      await api("/api/me/profile", { method: "PATCH", body: { name, phone: phone.trim() || null, timezone: timezone || null } });
      toast.success("Profile saved");
      router.refresh();
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.fields ? null : e2.message);
      setFields(e2.fields ?? {});
    } finally {
      setSaving(false);
    }
  }

  function detectZone() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zones.some((z) => z.value === tz)) setTimezone(tz);
    else toast.error("We couldn't detect your time zone. Choose it from the list.");
  }

  return (
    <div className="space-y-6">
      <SettingsCard title="Photo" description="Shown to professionals you book with, next to your name." id="photo-h">
        <div className="flex items-center gap-4">
          <Avatar name={name || initial.name} media={avatar} size={72} />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="sr-only" id="avatar-file" onChange={(e) => onPhoto(e.target.files?.[0])} tabIndex={-1} />
            <Button variant="secondary" className="h-11 sm:h-10" onClick={() => fileRef.current?.click()} loading={photoBusy === "upload"} disabled={photoBusy != null} icon={<Camera className="size-4" />}>
              {avatar ? "Change photo" : "Upload photo"}
            </Button>
            {avatar && (
              <Button variant="ghost" className="h-11 sm:h-10" onClick={removePhoto} loading={photoBusy === "remove"} disabled={photoBusy != null} icon={<Trash2 className="size-4" />}>
                Remove
              </Button>
            )}
          </div>
        </div>
        <p className="mt-3 text-[13px] text-ink-3">JPG, PNG or WebP, up to 15 MB. We strip location data from photos.</p>
      </SettingsCard>

      <form onSubmit={onSubmit} noValidate>
        <SettingsCard
          title="Personal details"
          id="details-h"
          footer={
            <Button type="submit" loading={saving} disabled={!dirty} className="h-11 sm:h-10">
              Save changes
            </Button>
          }
        >
          <div className="space-y-5">
            <FormError message={error} />
            <Field label="Name" error={fields.name}>
              {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required />}
            </Field>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink">Email</p>
              <p className="flex min-h-11 items-center rounded-md border border-line bg-surface-2 px-3 text-[15px] text-ink-2 md:min-h-10">{initial.email ?? "No email on file"}</p>
              <p className="text-[13px] leading-snug text-ink-3">
                To change your sign-in email,{" "}
                <Link href="/support/new?category=account" className="font-medium text-ink underline underline-offset-4">
                  contact support
                </Link>{" "}
                so we can confirm it&apos;s you.
              </p>
            </div>
            <Field
              label="Phone"
              optional
              error={fields.phone}
              hint={smsEnabled ? "Businesses you book with can call you about appointments, and we can text you reminders if you turn them on." : "Businesses you book with can use it to reach you about an appointment."}
            >
              {(p) => <Input {...p} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" maxLength={40} />}
            </Field>
            <Field label="Time zone" optional error={fields.timezone} hint="Your home time zone. Appointment times are always shown in the business's local time.">
              {(p) => (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <Select {...p} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      <option value="">Not set</option>
                      {zones.map((z) => (
                        <option key={z.value} value={z.value}>
                          {z.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button variant="secondary" className="h-11 shrink-0 md:h-10" onClick={detectZone} icon={<LocateFixed className="size-4" />}>
                    Detect automatically
                  </Button>
                </div>
              )}
            </Field>
          </div>
        </SettingsCard>
      </form>
    </div>
  );
}
