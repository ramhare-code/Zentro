"use client";

import { ActionForm, fieldClass, Submit } from "../ui/ActionForm";
import { createTicketAction, replyTicketAction } from "@/lib/actions/support";

const CATEGORIES: [string, string][] = [["order", "An order"], ["delivery", "Delivery"], ["return_refund", "Return or refund"], ["payment", "Payment"], ["product", "A product"], ["account", "My account"], ["other", "Something else"]];

export function NewTicketForm({ name, email, orderNumber }: { name?: string; email?: string; orderNumber?: string }) {
  return (
    <ActionForm action={createTicketAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Your name<input name="name" required defaultValue={name} className={fieldClass} /></label>
        <label className="text-sm font-medium">Email<input name="email" type="email" required defaultValue={email} className={fieldClass} /></label>
        <label className="text-sm font-medium">Mobile <span className="font-normal text-ink-muted">(optional)</span><input name="phone" type="tel" className={fieldClass} /></label>
        <label className="text-sm font-medium">Order number <span className="font-normal text-ink-muted">(if about an order)</span><input name="orderNumber" defaultValue={orderNumber} className={fieldClass} /></label>
      </div>
      <label className="block text-sm font-medium">What is it about?<select name="category" required defaultValue={orderNumber ? "order" : ""} className={fieldClass}><option value="" disabled>Choose a topic</option>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="block text-sm font-medium">Subject<input name="subject" required maxLength={150} className={fieldClass} /></label>
      <label className="block text-sm font-medium">How can we help?<textarea name="message" required minLength={10} maxLength={5000} rows={6} className={`${fieldClass} h-auto py-2`} /></label>
      <Submit>Send request</Submit>
    </ActionForm>
  );
}

export function TicketReplyForm({ ticketNumber, token }: { ticketNumber: string; token: string }) {
  return (
    <ActionForm action={replyTicketAction} className="space-y-3">
      <input type="hidden" name="ticketNumber" value={ticketNumber} /><input type="hidden" name="token" value={token} />
      <label className="block text-sm font-medium">Reply<textarea name="body" required maxLength={5000} rows={4} className={`${fieldClass} h-auto py-2`} /></label>
      <Submit>Send reply</Submit>
    </ActionForm>
  );
}
