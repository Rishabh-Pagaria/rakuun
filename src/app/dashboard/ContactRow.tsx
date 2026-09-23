"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/supabase-browser";
import type { Contact, ContactSource, InteractionType } from "@/lib/contacts";

type Interaction = {
  id: string;
  type: InteractionType;
  payload: Record<string, unknown>;
  created_at: string;
};

const SOURCE_STYLES: Record<ContactSource, { label: string; className: string }> = {
  extension: { label: "Extension", className: "bg-coffee-light/10 text-coffee-dark" },
  card_scan: { label: "Card scan", className: "bg-coffee-secondary/10 text-coffee-dark" },
  manual: { label: "Manual", className: "bg-coffee-medium-gray text-coffee-text-dark" }
};

const INTERACTION_LABELS: Record<InteractionType, string> = {
  email_sent: "Email sent",
  note: "Note",
  scan: "Scanned"
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export default function ContactRow({
  contact,
  onDeleted
}: {
  contact: Contact;
  onDeleted: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [interactions, setInteractions] = useState<Interaction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const badge = SOURCE_STYLES[contact.source] ?? SOURCE_STYLES.manual;
  const subtitle = [contact.title, contact.company].filter(Boolean).join(" · ");

  async function toggle() {
    const next = !expanded;
    setExpanded(next);

    if (!next || interactions !== null) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/contacts/${contact.id}/interactions`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load history (${res.status})`);
      }
      const body = await res.json();
      setInteractions(body.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${contact.name || contact.email || "this contact"}?`)) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to delete (${res.status})`);
      }
      onDeleted(contact.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete");
      setDeleting(false);
    }
  }

  return (
    <li className="rounded-lg border border-coffee-medium-gray bg-coffee-white shadow-coffee transition hover:shadow-coffee-hover">
      <div className="flex items-start gap-3 p-4">
        <button onClick={toggle} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-coffee-primary">
              {contact.name || contact.email || "Unnamed contact"}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          </div>

          {contact.name && contact.email && (
            <p className="truncate text-sm text-coffee-text-dark">{contact.email}</p>
          )}
          {subtitle && <p className="truncate text-sm text-coffee-secondary">{subtitle}</p>}
          {contact.phone && <p className="text-sm text-coffee-secondary">{contact.phone}</p>}

          {contact.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {contact.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-coffee-light-gray px-1.5 py-0.5 text-[11px] text-coffee-secondary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-[11px] text-coffee-secondary">{formatDate(contact.updated_at)}</span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-[11px] font-semibold text-coffee-secondary underline underline-offset-2 transition hover:text-coffee-primary disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-coffee-medium-gray px-4 py-3">
          {loading && <p className="text-xs text-coffee-secondary">Loading history...</p>}
          {error && <p className="text-xs text-coffee-text-dark">{error}</p>}

          {!loading && !error && interactions?.length === 0 && (
            <p className="text-xs text-coffee-secondary">No interactions recorded yet.</p>
          )}

          {!loading && !error && interactions && interactions.length > 0 && (
            <ul className="flex flex-col gap-2">
              {interactions.map((interaction) => (
                <li key={interaction.id} className="text-xs">
                  <span className="font-semibold text-coffee-dark">
                    {INTERACTION_LABELS[interaction.type] ?? interaction.type}
                  </span>
                  <span className="text-coffee-secondary"> · {formatDate(interaction.created_at)}</span>
                  {typeof interaction.payload.subject === "string" && (
                    <p className="text-coffee-text-dark">{interaction.payload.subject}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
