"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getBrowserSupabase } from "@/lib/supabase-browser";
import type { Contact, ContactSource } from "@/lib/contacts";
import ContactRow from "./ContactRow";

const SOURCE_FILTERS: { value: "" | ContactSource; label: string }[] = [
  { value: "", label: "All" },
  { value: "extension", label: "Extension" },
  { value: "card_scan", label: "Card scan" },
  { value: "manual", label: "Manual" }
];

export default function Dashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [source, setSource] = useState<"" | ContactSource>("");

  useEffect(() => {
    getBrowserSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) {
          router.replace("/");
          return;
        }
        setUserEmail(data.session.user.email ?? null);
        setReady(true);
      })
      .catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (source) params.set("source", source);

      const res = await apiFetch(`/api/contacts?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load contacts (${res.status})`);
      }

      const body = await res.json();
      setContacts(body.data ?? []);
      setCount(body.count ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, source]);

  useEffect(() => {
    if (ready) loadContacts();
  }, [ready, loadContacts]);

  async function handleSignOut() {
    await getBrowserSupabase().auth.signOut();
    router.replace("/");
  }

  function handleDeleted(id: string) {
    setContacts((current) => current.filter((contact) => contact.id !== id));
    setCount((current) => Math.max(current - 1, 0));
  }

  if (!ready) {
    return <p className="p-8 text-sm text-coffee-secondary">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <header className="flex items-center justify-between gap-4 border-b border-coffee-medium-gray pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-coffee-primary">Contacts</h1>
          <p className="text-sm text-coffee-secondary">
            {loading ? "Loading..." : `${count} ${count === 1 ? "person" : "people"}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="hidden text-xs text-coffee-secondary sm:inline">{userEmail}</span>
          )}
          <button
            onClick={handleSignOut}
            className="rounded-md border border-coffee-medium-gray px-3 py-1.5 text-xs font-semibold text-coffee-primary transition hover:bg-coffee-light-gray"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, company or title..."
          className="w-full rounded-lg border border-coffee-medium-gray px-3 py-2 text-sm text-coffee-text-dark outline-none transition placeholder:text-coffee-secondary/60 focus:border-coffee-primary focus:ring-3 focus:ring-coffee-primary/12"
        />
        <div className="flex shrink-0 gap-1.5">
          {SOURCE_FILTERS.map((filter) => (
            <button
              key={filter.value || "all"}
              onClick={() => setSource(filter.value)}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                source === filter.value
                  ? "border-coffee-primary bg-coffee-primary text-coffee-white"
                  : "border-coffee-medium-gray text-coffee-secondary hover:bg-coffee-light-gray"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-lg border border-coffee-medium-gray bg-coffee-light-gray p-4">
          <p className="text-sm text-coffee-text-dark">{error}</p>
          <button
            onClick={loadContacts}
            className="mt-2 text-xs font-semibold text-coffee-primary underline underline-offset-2 hover:text-coffee-dark"
          >
            Try again
          </button>
        </div>
      )}

      {!error && loading && (
        <p className="mt-8 text-center text-sm text-coffee-secondary">Loading contacts...</p>
      )}

      {!error && !loading && contacts.length === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-coffee-medium-gray p-8 text-center">
          <p className="text-sm font-semibold text-coffee-text-dark">
            {debouncedSearch || source ? "No contacts match that filter." : "No contacts yet."}
          </p>
          <p className="mt-1 text-xs text-coffee-secondary">
            {debouncedSearch || source
              ? "Try a different search or source."
              : "Send an email from the extension and the recipient shows up here."}
          </p>
        </div>
      )}

      {!error && !loading && contacts.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2.5">
          {contacts.map((contact) => (
            <ContactRow key={contact.id} contact={contact} onDeleted={handleDeleted} />
          ))}
        </ul>
      )}
    </div>
  );
}
