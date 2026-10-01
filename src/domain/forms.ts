/** Generic intake questions, reusable across any industry. */
import { z } from "zod";

export const FIELD_TYPES = {
  short_text: "Short answer",
  long_text: "Paragraph",
  yes_no: "Yes / No",
  single_choice: "Multiple choice",
  multi_choice: "Checkboxes",
  date: "Date",
  acknowledgement: "Acknowledgement",
} as const;
export type FieldType = keyof typeof FIELD_TYPES;

export const formFieldSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(Object.keys(FIELD_TYPES) as [FieldType, ...FieldType[]]),
  label: z.string().trim().min(1).max(200),
  helpText: z.string().trim().max(500).optional(),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const formFieldsSchema = z
  .array(formFieldSchema)
  .max(30)
  .superRefine((fields, ctx) => {
    const ids = new Set<string>();
    fields.forEach((f, i) => {
      if (ids.has(f.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: "Duplicate field id" });
      ids.add(f.id);
      if ((f.type === "single_choice" || f.type === "multi_choice") && (!f.options || f.options.length < 2))
        ctx.addIssue({ code: "custom", path: [i, "options"], message: "Add at least two choices" });
    });
  });

export type IntakeAnswer = { fieldId: string; label: string; answer: string | boolean | string[] };

export function validateAnswers(
  fields: FormField[],
  raw: Record<string, unknown>,
): { ok: true; answers: IntakeAnswer[] } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const answers: IntakeAnswer[] = [];
  for (const f of fields) {
    const v = raw[f.id];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0) || (f.type === "acknowledgement" && v !== true);
    if (empty) {
      if (f.required) errors[f.id] = f.type === "acknowledgement" ? "Please confirm to continue." : "This question is required.";
      continue;
    }
    switch (f.type) {
      case "short_text":
      case "long_text": {
        const max = f.type === "short_text" ? 300 : 3000;
        if (typeof v !== "string") errors[f.id] = "Invalid answer.";
        else if (v.trim().length > max) errors[f.id] = `Keep it under ${max} characters.`;
        else answers.push({ fieldId: f.id, label: f.label, answer: v.trim() });
        break;
      }
      case "yes_no":
      case "acknowledgement":
        if (typeof v !== "boolean") errors[f.id] = "Invalid answer.";
        else answers.push({ fieldId: f.id, label: f.label, answer: v });
        break;
      case "single_choice":
        if (typeof v !== "string" || !f.options?.includes(v)) errors[f.id] = "Choose one of the options.";
        else answers.push({ fieldId: f.id, label: f.label, answer: v });
        break;
      case "multi_choice":
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !f.options?.includes(x))) errors[f.id] = "Invalid choice.";
        else answers.push({ fieldId: f.id, label: f.label, answer: [...new Set(v as string[])] });
        break;
      case "date":
        if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[f.id] = "Enter a valid date.";
        else answers.push({ fieldId: f.id, label: f.label, answer: v });
        break;
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
}
