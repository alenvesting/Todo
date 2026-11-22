import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getInvitation, isDemo, type InvitationPreview } from '../lib/supabase';
import { useAuth, useStore } from '../store';
import { Login } from './Login';

function usePreview(token: string) {
  const [preview, setPreview] = useState<InvitationPreview | null | undefined>(undefined);
  const { user } = useAuth();
  useEffect(() => {
    if (isDemo) return setPreview(null);
    getInvitation(token)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [token, user?.id]);
  return preview;
}

function InviteIntro({ preview }: { preview: InvitationPreview | null | undefined }) {
  if (preview === undefined) return <p className="invite-intro">Hämtar inbjudan…</p>;
  if (!preview || !preview.valid)
    return <p className="invite-intro error">Inbjudan är ogiltig, har gått ut eller har redan använts. Be om en ny länk.</p>;
  return (
    <p className="invite-intro">
      <strong>{preview.inviter_name}</strong> har bjudit in dig till{' '}
      <strong>
        {preview.list_emoji} {preview.list_name}
      </strong>
      . Logga in för att gå med.
    </p>
  );
}

/** Visas för utloggade användare som öppnar en inbjudningslänk */
export function InviteLogin() {
  const { token = '' } = useParams();
  const preview = usePreview(token);
  return <Login intro={<InviteIntro preview={preview} />} />;
}

/** Visas för inloggade användare */
export function InviteAccept() {
  const { token = '' } = useParams();
  const preview = usePreview(token);
  const store = useStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preview?.already_member) navigate(`/list/${preview.list_id}`, { replace: true });
  }, [preview, navigate]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const listId = await store.acceptInvite(token);
      navigate(`/list/${listId}`, { replace: true });
      store.toast('Välkommen! Listan är nu delad med dig.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div className="login-card">
        <div className="brand">
          <img src="/icon.svg" alt="" width={56} height={56} />
          <h1>Inbjudan</h1>
        </div>
        {preview && preview.valid ? (
          <>
            <p className="invite-intro">
              <strong>{preview.inviter_name}</strong> har bjudit in dig till{' '}
              <strong>
                {preview.list_emoji} {preview.list_name}
              </strong>
              .
            </p>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={() => void accept()}>
              Gå med i listan
            </button>
          </>
        ) : (
          <InviteIntro preview={preview} />
        )}
        {error && <p className="error">{error}</p>}
        <Link to="/" className="btn btn-ghost btn-block">
          Till mina listor
        </Link>
      </div>
    </main>
  );
}
