"use client";

import { Camera, LocateFixed, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { Avatar, type MediaLike } from "@/components/ui/media";
import { useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { uploadMedia } from "@/lib/upload";
import { rich } from "@/i18n/rich";
import { SettingsCard } from "./settings-card";

type Props = {
  initial: { name: string; email: string | null; phone: string | null; timezone: string | null; avatar: MediaLike | null };
  zones: { value: string; label: string }[];
  smsEnabled: boolean;
};

export function ProfileForm({ initial, zones, smsEnabled }: Props) {
  const router = useRouter();
  const t = useT("account");
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
      const up = await uploadMedia(file, { purpose: "avatar", alt: name });
      await api("/api/me/profile", { method: "PATCH", body: { avatarMediaId: up.id } });
      setAvatar(up.media);
      toast.success(t("profile.photo.updated"));
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
      toast.success(t("profile.photo.removed"));
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
      toast.success(t("profile.saved"));
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
    else toast.error(t("profile.timezone.detectFailed"));
  }

  return (
    <div className="space-y-6">
      <SettingsCard title={t("profile.photo.title")} description={t("profile.photo.description")} id="photo-h">
        <div className="flex items-center gap-4">
          <Avatar name={name || initial.name} media={avatar} size={72} />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="sr-only" id="avatar-file" onChange={(e) => onPhoto(e.target.files?.[0])} tabIndex={-1} />
            <Button variant="secondary" className="h-11 sm:h-10" onClick={() => fileRef.current?.click()} loading={photoBusy === "upload"} disabled={photoBusy != null} icon={<Camera className="size-4" />}>
              {avatar ? t("profile.photo.change") : t("profile.photo.upload")}
            </Button>
            {avatar && (
              <Button variant="ghost" className="h-11 sm:h-10" onClick={removePhoto} loading={photoBusy === "remove"} disabled={photoBusy != null} icon={<Trash2 className="size-4" />}>
                {t("profile.photo.remove")}
              </Button>
            )}
          </div>
        </div>
        <p className="mt-3 text-[13px] text-ink-3">{t("profile.photo.hint")}</p>
      </SettingsCard>

      <form onSubmit={onSubmit} noValidate>
        <SettingsCard
          title={t("profile.details")}
          id="details-h"
          footer={
            <Button type="submit" loading={saving} disabled={!dirty} className="h-11 sm:h-10">
              {t("saveChanges")}
            </Button>
          }
        >
          <div className="space-y-5">
            <FormError message={error} />
            <Field label={t("profile.name")} error={fields.name}>
              {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required />}
            </Field>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink">{t("profile.email")}</p>
              <p className="flex min-h-11 items-center rounded-md border border-line bg-surface-2 px-3 text-[15px] text-ink-2 md:min-h-10">{initial.email ?? t("noEmail")}</p>
              <p className="text-[13px] leading-snug text-ink-3">
                {rich(t("profile.changeEmail"), {
                  link: (text) => (
                    <Link href="/support/new?category=account" className="font-medium text-ink underline underline-offset-4">
                      {text}
                    </Link>
                  ),
                })}
              </p>
            </div>
            <Field
              label={t("profile.phone")}
              optional
              error={fields.phone}
              hint={smsEnabled ? t("profile.phoneHintSms") : t("profile.phoneHint")}
            >
              {(p) => <Input {...p} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" maxLength={40} />}
            </Field>
            <Field label={t("profile.timezone.label")} optional error={fields.timezone} hint={t("profile.timezone.hint")}>
              {(p) => (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <Select {...p} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      <option value="">{t("profile.timezone.notSet")}</option>
                      {zones.map((z) => (
                        <option key={z.value} value={z.value}>
                          {z.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button variant="secondary" className="h-11 shrink-0 md:h-10" onClick={detectZone} icon={<LocateFixed className="size-4" />}>
                    {t("profile.timezone.detect")}
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
