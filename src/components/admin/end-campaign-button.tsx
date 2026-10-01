import { Square } from "lucide-react";
import { ActionButton } from "./action-button";

export function EndCampaignButton({ id, businessName }: { id: string; businessName: string }) {
  return (
    <ActionButton
      endpoint={`/api/admin/spotlight/${id}/end`}
      label="End"
      icon={<Square className="size-3.5" />}
      variant="danger"
      title="End this Spotlight campaign?"
      description={`${businessName} stops appearing as Promoted immediately. The owner is notified with your reason. This can't be undone.`}
      confirmLabel="End campaign"
      tone="danger"
      note={{ name: "reason", label: "Reason (sent to the owner)", required: true }}
      success="Campaign ended"
    />
  );
}
