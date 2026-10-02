import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalDoc } from "@/components/consent/LegalDoc";
import { legalInfo } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  const { operator, email, law } = legalInfo();
  return (
    <LegalDoc
      title="Terms of use"
      intro={`These terms govern your use of the Portal, the web control room for the D&D recorder bot, run by ${operator}. By signing in or using the demo you accept them. If you do not, please do not use the Portal.`}
    >
      <h2>1. Who may use it</h2>
      <p>
        The Portal is a private tool. Only members of the campaign Discord server who hold an admin role can sign in, and some tools (the DM Screen) are limited further. Access can change or end at any time with your role. The public demo uses made-up data and needs no account.
      </p>
      <p>You must be old enough to use Discord and to agree to these terms where you live, and in any case at least 16.</p>

      <h2>2. Your account</h2>
      <p>You sign in with Discord; we do not hold a password for you. Keep your Discord account secure. You are responsible for what is done under your session, and should sign out on shared devices.</p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Do not try to bypass access controls, probe for vulnerabilities, overload the service, or reach data that is not yours.</li>
        <li>Do not use the Portal to record anyone who has not been told and has not had the chance to object, or to break Discord&rsquo;s terms or the law.</li>
        <li>Do not upload or link content you have no right to use, or content that is unlawful, abusive or infringing.</li>
        <li>Do not use automated means to copy recordings or transcripts out in bulk except through features the Portal offers.</li>
      </ul>

      <h2>4. Recordings and content</h2>
      <p>
        You keep the rights you already have in what you say, write and upload. You give {operator} permission to store, process, transcribe, display to the group and delete that content as needed to run the Portal and the bot. Whoever starts a recording must make sure everyone in the channel knows and agrees; recording rules differ by country and the person who starts a recording is responsible for following them. The{" "}
        <Link href="/privacy">privacy policy</Link> explains how recordings are handled and deleted.
      </p>
      <p>You are responsible for having the right to play or save any music, sounds or links you add. The Portal does not grant rights in third-party content.</p>

      <h2>5. Game rules content</h2>
      <p>
        This work includes material from the System Reference Document 5.1 (&ldquo;SRD 5.1&rdquo;) and the System Reference Document 5.2 (&ldquo;SRD 5.2&rdquo;) by Wizards of the Coast LLC, available at{" "}
        <a href="https://dnd.wizards.com/resources/systems-reference-document" rel="noopener noreferrer">
          dnd.wizards.com/resources/systems-reference-document
        </a>
        . The SRDs are licensed under the{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/legalcode" rel="noopener noreferrer">
          Creative Commons Attribution 4.0 International License
        </a>
        .
      </p>
      <p>
        The Portal is an independent fan tool. It is not affiliated with, endorsed or sponsored by Wizards of the Coast, Discord, YouTube, SoundCloud or Open5e. Product names belong to their owners.
      </p>

      <h2>6. Availability and changes</h2>
      <p>The Portal is provided as a hobby service. It may be slow, change, break or go offline, and features can be added or removed. Keep your own copy of anything you cannot afford to lose; recordings and campaign data can be deleted by DMs and may be lost to failures.</p>

      <h2>7. Paid features</h2>
      <p>
        The Portal is currently free. If paid plans or purchases are introduced, the price, what is included, billing, renewal, cancellation and refund terms will be shown clearly before you pay, a separate payment provider may be involved and will be listed in the privacy policy, and nothing you already use will start costing money without your agreement. Consumer rights that the law gives you, such as withdrawal from distance purchases, will not be limited by these terms.
      </p>

      <h2>8. No warranty</h2>
      <p>
        To the extent the law allows, the Portal is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without promises that it is error-free, uninterrupted, or that transcripts, dice rolls or game data are accurate. Transcripts are machine generated and can be wrong.
      </p>

      <h2>9. Liability</h2>
      <p>
        To the extent the law allows, {operator} is not liable for indirect or consequential loss, lost data or lost game progress arising from use of the Portal, and total liability for any claim is limited to the amount you paid for the Portal in the previous 12 months (zero while it is free). Nothing here limits liability that cannot be limited by law, including for death or personal injury caused by negligence, fraud, or your statutory consumer rights.
      </p>

      <h2>10. Suspension and ending</h2>
      <p>We may suspend or end access if you break these terms or put the service or others at risk. You can stop using the Portal at any time and ask us to delete your data as described in the privacy policy. Sections that by nature should survive (content permissions you gave for stored recordings until deleted, liability, governing law) do.</p>

      <h2>11. Changes to these terms</h2>
      <p>We may update these terms. If a change is significant we will say so in the Portal or in the Discord server before it applies. Continuing to use the Portal after the change means you accept it.</p>

      <h2>12. Governing law and contact</h2>
      <p>
        {law ? `These terms are governed by the laws of ${law}, and courts there have jurisdiction, without taking away mandatory consumer protections of your country of residence.` : "These terms are governed by the law that applies where the operator is based, without taking away mandatory consumer protections of your country of residence."}{" "}
        Questions or complaints: <Contact email={email} operator={operator} />.
      </p>
      <p>
        See also the <Link href="/privacy">privacy policy</Link> and the <Link href="/cookies">cookie policy</Link>.
      </p>
    </LegalDoc>
  );
}
