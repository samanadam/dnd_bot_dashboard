import type { Metadata } from "next";
import Link from "next/link";
import { CookieSettingsButton } from "@/components/consent/CookieSettingsButton";
import { LegalDoc, Table } from "@/components/consent/LegalDoc";

export const metadata: Metadata = { title: "Cookie policy" };

export default function CookiesPage() {
  return (
    <LegalDoc
      title="Cookie policy"
      intro="Cookies are small files a website stores in your browser. The Portal uses a few, listed here with what each does and how long it lasts. We do not use analytics, advertising or tracking cookies, and no third party sets a cookie through the Portal."
    >
      <h2>Strictly necessary</h2>
      <p>These make the Portal work and are set without asking, because it cannot sign you in or remember your choice without them.</p>
      <Table
        head={["Name", "Purpose", "Lasts"]}
        rows={[
          [<><code>authjs.session-token</code> (prefixed __Secure- over HTTPS)</>, "Your signed-in session, including an encrypted Discord token. Secure and not readable by scripts.", "Up to 12 hours"],
          [<code key="b">authjs.csrf-token, authjs.callback-url, authjs.state, authjs.pkce.code_verifier</code>, "Protect the Discord sign-in from forgery and send you back to the right page.", "Sign-in only (minutes)"],
          [<code key="c">portal_consent</code>, "Remembers your cookie choice.", "180 days"],
        ]}
      />

      <h2>Preferences (only with your consent)</h2>
      <p>
        These remember how you like the Portal. With your consent they last a year. If you decline, they still work during your visit but are forgotten when you close the browser.
      </p>
      <Table
        head={["Name", "Where", "Purpose", "Lasts with consent"]}
        rows={[
          [<code key="a">portal-theme</code>, "Cookie", "Your colour theme", "1 year"],
          [<code key="b">portal_campaign</code>, "Cookie", "The campaign you picked, so lists filter to it", "1 year"],
          [<code key="c">portal.campaign, portal.bot.*</code>, "Browser storage", "The campaign and the voice and text channel ids you chose", "Until you clear it"],
          [<code key="d">dm-dice-autosend</code>, "Browser storage", "Your &ldquo;send rolls to Discord&rdquo; setting", "Until you clear it"],
        ]}
      />
      <p>Without consent the same items sit in session storage or session cookies. The dice history is always kept in session storage and is gone when the tab closes.</p>

      <h2>Your choices</h2>
      <p>
        Change your mind at any time: <CookieSettingsButton className="font-medium text-accent underline-offset-2 hover:underline" />. Declining or withdrawing moves what is stored to session-only straight away. You can also delete cookies and site data in your browser settings; you will be signed out and asked again.
      </p>

      <h2>If we add more later</h2>
      <p>
        If the Portal ever adds a cookie that is not strictly necessary, such as analytics or a payment provider, it will be listed here, will stay off until you agree, and you will be asked again.
      </p>
      <p>
        More on how data is handled: <Link href="/privacy">privacy policy</Link>. Rules of use: <Link href="/terms">terms</Link>.
      </p>
    </LegalDoc>
  );
}
