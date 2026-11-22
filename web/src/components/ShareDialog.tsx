import { useState } from 'react';
import { profileName, membersOf } from '../lib/selectors';
import { inviteUrl, isDemo } from '../lib/supabase';
import type { Invitation, List } from '../lib/types';
import { useStore } from '../store';
import { CopyIcon, LinkIcon, MailIcon, ShareIcon, XIcon } from './Icons';
import { Avatar, Modal } from './ui';

function inviteText(list: List, inviter: string, url: string) {
  return `Hej! ${inviter} vill dela listan "${list.emoji ? list.emoji + ' ' : ''}${list.name}" med dig i Bocka. Öppna länken och logga in med e-post, Microsoft, Google eller Facebook för att gå med:\n\n${url}`;
}

export function ShareDialog({ list, onClose }: { list: List; onClose: () => void }) {
  const store = useStore();
  const { data, user } = store;
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const isOwner = list.owner_id === user.id;
  const members = membersOf(data, list.id).sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
  const invites = data.invitations.filter((i) => i.list_id === list.id && !i.accepted_by && new Date(i.expires_at) > new Date());
  const link = invites.find((i) => !i.email);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      store.toast((e as Error).message || 'Något gick fel');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (inv: Invitation) => {
    const url = inviteUrl(inv.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(inv.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      prompt('Kopiera länken:', url);
    }
  };

  const shareNative = async (inv: Invitation) => {
    const url = inviteUrl(inv.token);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Gå med i ${list.name}`, text: inviteText(list, user.name, url) });
      } catch {
        /* avbrutet */
      }
    } else {
      void copy(inv);
    }
  };

  const inviteByEmail = () =>
    run(async () => {
      const addr = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) throw new Error('Ange en giltig e-postadress');
      const inv = await store.createInvite(list.id, addr);
      setEmail('');
      const subject = encodeURIComponent(`${user.name} delar "${list.name}" med dig`);
      const body = encodeURIComponent(inviteText(list, user.name, inviteUrl(inv.token)));
      window.location.href = `mailto:${addr}?subject=${subject}&body=${body}`;
      store.toast(`Inbjudan skapad. Den syns även direkt i appen när ${addr} loggar in.`);
    });

  return (
    <Modal title={`Dela "${list.name}"`} onClose={onClose} wide>
      {isDemo ? (
        <p className="hint">
          Delning kräver att appen är kopplad till en Supabase-databas. Se <code>README.md</code> för hur du sätter upp den (tar ca 15 minuter).
        </p>
      ) : (
        <>
          <section className="share-section">
            <h3>Medlemmar</h3>
            <ul className="members">
              {members.map((m) => {
                const p = data.profiles.find((x) => x.id === m.user_id);
                return (
                  <li key={m.user_id}>
                    <Avatar profile={p} size={32} />
                    <div className="grow">
                      <strong>
                        {profileName(p)}
                        {m.user_id === user.id && ' (du)'}
                      </strong>
                      <span className="muted">{m.role === 'owner' ? 'Ägare' : p?.email}</span>
                    </div>
                    {isOwner && m.role !== 'owner' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => confirm(`Ta bort ${profileName(p)} från listan?`) && store.removeMember(list.id, m.user_id)}
                      >
                        Ta bort
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="share-section">
            <h3>Bjud in med e-post</h3>
            <p className="hint">
              Personen får ett mejl med en länk och kan logga in med e-post, Microsoft, Google eller Facebook. Loggar de in med just den här
              adressen dyker inbjudan också upp direkt i appen.
            </p>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                void inviteByEmail();
              }}
            >
              <input type="email" className="grow" placeholder="namn@exempel.se" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <button className="btn btn-primary" disabled={busy || !email.trim()}>
                <MailIcon size={18} /> Bjud in
              </button>
            </form>
          </section>

          <section className="share-section">
            <h3>Inbjudningslänk</h3>
            <p className="hint">Skicka länken via SMS, WhatsApp, Messenger eller liknande. Alla med länken kan gå med tills du tar bort den.</p>
            {link ? (
              <div className="link-box">
                <LinkIcon size={18} />
                <input readOnly value={inviteUrl(link.token)} onFocus={(e) => e.target.select()} aria-label="Inbjudningslänk" />
                <button className="btn btn-ghost btn-sm" onClick={() => void copy(link)}>
                  <CopyIcon size={16} /> {copied === link.id ? 'Kopierad!' : 'Kopiera'}
                </button>
                {'share' in navigator && (
                  <button className="btn btn-primary btn-sm" onClick={() => void shareNative(link)}>
                    <ShareIcon size={16} /> Skicka
                  </button>
                )}
              </div>
            ) : (
              <button className="btn btn-primary" disabled={busy} onClick={() => void run(() => store.createInvite(list.id, null))}>
                <LinkIcon size={18} /> Skapa inbjudningslänk
              </button>
            )}
          </section>

          {invites.length > 0 && (
            <section className="share-section">
              <h3>Aktiva inbjudningar</h3>
              <ul className="members">
                {invites.map((i) => (
                  <li key={i.id}>
                    <span className="invite-icon">{i.email ? <MailIcon size={18} /> : <LinkIcon size={18} />}</span>
                    <div className="grow">
                      <strong>{i.email ?? 'Inbjudningslänk'}</strong>
                      <span className="muted">Gäller till {new Date(i.expires_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</span>
                    </div>
                    {i.email && (
                      <button className="btn btn-ghost btn-sm" onClick={() => void copy(i)}>
                        {copied === i.id ? 'Kopierad!' : 'Kopiera länk'}
                      </button>
                    )}
                    <button className="icon-btn subtle" onClick={() => void run(() => store.revokeInvite(i.id))} aria-label="Återkalla inbjudan">
                      <XIcon size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {isOwner && members.length > 1 && (
            <section className="share-section">
              <button
                className="btn btn-danger-ghost"
                disabled={busy}
                onClick={() =>
                  confirm('Sluta dela? Alla andra medlemmar tas bort och alla inbjudningar slutar fungera.') &&
                  void run(() => store.stopSharing(list.id))
                }
              >
                Sluta dela
              </button>
            </section>
          )}
        </>
      )}
    </Modal>
  );
}
