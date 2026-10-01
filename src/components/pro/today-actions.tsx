"use client";

import { CalendarPlus, Ban } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BlockTimeDialog, NewAppointmentDialog } from "./pro-dialogs";

type Props = {
  services: { id: string; name: string; durationMinutes: number }[];
  team: { id: string; name: string }[];
  timezone: string;
  canAll: boolean;
  canBook: boolean;
  canBlock: boolean;
  selfMemberId: string;
  compact?: boolean;
};

export function TodayActions(p: Props) {
  const [newOpen, setNewOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  return (
    <>
      {p.canBlock && (
        <Button variant="secondary" onClick={() => setBlockOpen(true)} icon={<Ban className="size-4" />}>
          Block time
        </Button>
      )}
      {p.canBook && p.services.length > 0 && (
        <Button onClick={() => setNewOpen(true)} icon={<CalendarPlus className="size-4" />}>
          New appointment
        </Button>
      )}
      {newOpen && <NewAppointmentDialog open={newOpen} onOpenChange={setNewOpen} services={p.services} team={p.team} timezone={p.timezone} canAssignOthers={p.canAll} selfMemberId={p.selfMemberId} />}
      {blockOpen && <BlockTimeDialog open={blockOpen} onOpenChange={setBlockOpen} team={p.team} timezone={p.timezone} canAll={p.canAll} selfMemberId={p.selfMemberId} />}
    </>
  );
}
