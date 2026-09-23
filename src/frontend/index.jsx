/**
 * Checklists for Jira — Forge port of the open-source Connect app
 * "jira-checklist-plugin" (samid737, Apache-2.0).
 *
 * Data compatibility: the Connect app stored each issue's checklist in the issue
 * entity property `todos` as { todos: { "<item text>": <done boolean>, ... } }.
 * This port reads and writes EXACTLY that property and shape, so a site that
 * migrates from the Connect app keeps every existing checklist with no migration.
 *
 * Architecture change: the Connect app needed an Express server (JWT auth, install
 * lifecycle, SQLite store, Handlebars templates, AUI + jQuery UI). On Forge none of
 * that exists — the panel talks to Jira directly as the current user via requestJira.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Text, Strong, Textfield, Button, Checkbox, Stack, Inline, SectionMessage,
} from '@forge/react';
import { requestJira, view } from '@forge/bridge';

const PROPERTY_KEY = 'todos'; // must match the Connect app for data continuity

// Entity property <-> UI list. Object key order is insertion order, same as the original.
const toItems = (obj) => Object.entries(obj || {}).map(([text, done]) => ({ text, done: !!done }));
const toObject = (items) => items.reduce((o, i) => { o[i.text] = i.done; return o; }, {});

async function loadChecklist(issueKey) {
  const res = await requestJira(`/rest/api/3/issue/${issueKey}/properties/${PROPERTY_KEY}`);
  if (res.status === 404) return []; // no checklist yet
  if (!res.ok) throw new Error(`Could not load checklist (HTTP ${res.status}).`);
  const data = await res.json();
  return toItems(data.value && data.value.todos);
}

async function saveChecklist(issueKey, items) {
  const res = await requestJira(`/rest/api/3/issue/${issueKey}/properties/${PROPERTY_KEY}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ todos: toObject(items) }), // same wrapper the Connect app wrote
  });
  if (!res.ok) throw new Error(`Could not save checklist (HTTP ${res.status}).`);
}

const App = () => {
  const [issueKey, setIssueKey] = useState(null);
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const ctx = await view.getContext();
        const key = ctx.extension.issue.key;
        setIssueKey(key);
        setItems(await loadChecklist(key));
      } catch (e) {
        setError(e && e.message ? e.message : 'Could not load checklist.');
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Optimistic update, then persist the whole list (the property is one JSON blob).
  const persist = async (next) => {
    const previous = items;
    setItems(next);
    setBusy(true);
    setError(null);
    try { await saveChecklist(issueKey, next); }
    catch (e) { setItems(previous); setError(e && e.message ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  };

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    // Same semantics as the original: item text is the key, so a duplicate replaces.
    persist(items.filter((i) => i.text !== text).concat({ text, done: false }));
  };
  const toggle = (idx) => persist(items.map((i, n) => (n === idx ? { ...i, done: !i.done } : i)));
  const remove = (idx) => persist(items.filter((_, n) => n !== idx));
  // UI Kit has no drag-and-drop (the original used jQuery UI sortable) — up/down instead.
  const move = (idx, delta) => {
    const j = idx + delta;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    persist(next);
  };

  const doneCount = items.filter((i) => i.done).length;

  if (!loaded) return <Text>Loading…</Text>;

  return (
    <Stack space="space.150">
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}

      {items.length > 0 ? (
        <Stack space="space.050">
          <Text><Strong>{doneCount} of {items.length} done</Strong></Text>
          {items.map((item, idx) => (
            <Inline key={`${idx}-${item.text}`} space="space.100" alignBlock="center" spread="space-between">
              <Checkbox label={item.text} isChecked={item.done} onChange={() => toggle(idx)} isDisabled={busy} />
              <Inline space="space.050">
                <Button appearance="subtle" spacing="compact" isDisabled={busy || idx === 0} onClick={() => move(idx, -1)}>↑</Button>
                <Button appearance="subtle" spacing="compact" isDisabled={busy || idx === items.length - 1} onClick={() => move(idx, 1)}>↓</Button>
                <Button appearance="subtle" spacing="compact" isDisabled={busy} onClick={() => remove(idx)}>✕</Button>
              </Inline>
            </Inline>
          ))}
        </Stack>
      ) : (
        <Text>No checklist items yet.</Text>
      )}

      <Inline space="space.100" alignBlock="center">
        <Textfield
          name="newItem"
          placeholder="Add an item and press Enter"
          value={draft}
          onChange={(e) => setDraft(String(e.target.value || ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <Button appearance="primary" isDisabled={busy || !draft.trim()} onClick={add}>Add</Button>
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
