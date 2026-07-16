// Shared signed-out auth panel: create an account (email + password + chosen
// username) or sign in (password, or a magic link for the passwordless).
// Rendered by game.ts (lobby) and home.ts (hub); success surfaces through
// onAuthChange, so callers just re-render on session change.

import { sendMagicLink, signInWithPassword, signUpWithPassword, USERNAME_RE } from './auth';
import { el } from './ui';

export interface AuthPanelOpts {
  heading?: string;
  // Where the magic-link / confirmation email should land the user back.
  redirectTo?: string;
}

function input(type: string, placeholder: string, autocomplete: AutoFill): HTMLInputElement {
  const i = el('input');
  i.type = type;
  i.placeholder = placeholder;
  i.autocomplete = autocomplete;
  i.required = true;
  return i;
}

export function renderAuthPanel(panel: HTMLElement, opts: AuthPanelOpts = {}): void {
  panel.replaceChildren();
  panel.appendChild(el('div', 'auth-heading', opts.heading ?? 'Sign in to play online'));

  const tabs = el('div', 'auth-tabs');
  const tabIn = el('button', 'auth-tab active', 'Sign in');
  const tabUp = el('button', 'auth-tab', 'Create account');
  tabIn.type = 'button';
  tabUp.type = 'button';
  tabs.append(tabIn, tabUp);
  panel.appendChild(tabs);

  const body = el('div', 'auth-body');
  const msg = el('p', 'auth-msg');
  panel.append(body, msg);

  const redirect = opts.redirectTo ?? `${location.origin}${location.pathname}${location.search}`;

  const busy = async (btn: HTMLButtonElement, work: () => Promise<string | null>) => {
    btn.disabled = true;
    msg.textContent = '';
    try {
      const note = await work();
      if (note) msg.textContent = note;
      else btn.disabled = false;
    } catch (err) {
      msg.textContent = err instanceof Error ? err.message : String(err);
      btn.disabled = false;
    }
  };

  function showSignIn(): void {
    tabIn.classList.add('active');
    tabUp.classList.remove('active');
    body.replaceChildren();

    const form = el('form', 'auth-form auth-form-stack');
    const email = input('email', 'you@example.com', 'email');
    const password = input('password', 'password', 'current-password');
    const submit = el('button', 'lobby-btn', 'Sign in');
    submit.type = 'submit';
    form.append(email, password, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(submit, async () => {
        await signInWithPassword(email.value.trim(), password.value);
        return 'Signed in.';
      });
    });

    const link = el('button', 'lobby-link', 'Email me a sign-in link instead');
    link.type = 'button';
    link.addEventListener('click', () => {
      if (!email.value.trim()) {
        msg.textContent = 'Enter your email above first.';
        return;
      }
      busy(link, async () => {
        await sendMagicLink(email.value.trim(), redirect);
        return 'Check your email for a sign-in link.';
      });
    });

    body.append(form, link);
  }

  function showSignUp(): void {
    tabUp.classList.add('active');
    tabIn.classList.remove('active');
    body.replaceChildren();

    const form = el('form', 'auth-form auth-form-stack');
    const username = input('text', 'username (3-24 letters, digits, _)', 'username');
    const email = input('email', 'you@example.com', 'email');
    const password = input('password', 'password (8+ characters)', 'new-password');
    password.minLength = 8;
    const submit = el('button', 'lobby-btn', 'Create account');
    submit.type = 'submit';
    form.append(username, email, password, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = username.value.trim();
      if (!USERNAME_RE.test(name)) {
        msg.textContent = 'Usernames are 3-24 letters, digits, or underscores.';
        return;
      }
      busy(submit, async () => {
        const { needsConfirmation } = await signUpWithPassword(email.value.trim(), password.value, name);
        return needsConfirmation
          ? 'Almost there — confirm via the email we just sent, then you land back here signed in.'
          : 'Account created.';
      });
    });

    body.appendChild(form);
  }

  tabIn.addEventListener('click', showSignIn);
  tabUp.addEventListener('click', showSignUp);
  showSignIn();
}
