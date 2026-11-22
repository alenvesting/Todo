import { useState, type ReactNode } from 'react';
import { enabledProviders, supabase, type OAuthProvider } from '../lib/supabase';
import { FacebookLogo, GoogleLogo, MailIcon, MicrosoftLogo } from './Icons';

const providerInfo: Record<OAuthProvider, { label: string; logo: JSX.Element }> = {
  azure: { label: 'Fortsätt med Microsoft', logo: <MicrosoftLogo /> },
  google: { label: 'Fortsätt med Google', logo: <GoogleLogo /> },
  facebook: { label: 'Fortsätt med Facebook', logo: <FacebookLogo /> },
};

export function Login({ intro }: { intro?: ReactNode }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectTo = window.location.origin + window.location.pathname;

  const oauth = async (provider: OAuthProvider) => {
    setError(null);
    const { error } = await supabase!.auth.signInWithOAuth({
      provider,
      options: { redirectTo, scopes: provider === 'azure' ? 'email openid profile' : undefined },
    });
    if (error) setError(error.message);
  };

  const sendLink = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError('Koden stämmer inte eller har gått ut. Försök igen.');
  };

  return (
    <main className="login">
      <div className="login-card">
        <div className="brand">
          <img src="/icon.svg" alt="" width={56} height={56} />
          <h1>Bocka</h1>
          <p>Inköpslistor och att göra – tillsammans.</p>
        </div>

        {intro}

        {!sent ? (
          <>
            <div className="providers">
              {enabledProviders.map((p) => (
                <button key={p} className="btn btn-provider" onClick={() => void oauth(p)}>
                  {providerInfo[p].logo}
                  <span>{providerInfo[p].label}</span>
                </button>
              ))}
            </div>

            {enabledProviders.length > 0 && <div className="or">eller med e-post</div>}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendLink();
              }}
            >
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="din@epost.se"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="E-postadress"
              />
              <button className="btn btn-primary btn-block" disabled={busy || !email.trim()}>
                <MailIcon size={18} /> Skicka inloggningslänk
              </button>
            </form>
            <p className="fine">Inget lösenord behövs. Nytt konto skapas automatiskt första gången.</p>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <p className="sent">
              Vi har skickat ett mejl till <strong>{email}</strong>. Klicka på länken i mejlet, eller skriv in koden här:
            </p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Kod från mejlet"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
              aria-label="Engångskod"
              className="code-input"
            />
            <button className="btn btn-primary btn-block" disabled={busy || code.length < 6}>
              Logga in
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setSent(false)}>
              Använd en annan adress
            </button>
          </form>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
