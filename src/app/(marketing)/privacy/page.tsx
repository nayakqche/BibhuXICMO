import { LegalPage } from "@/frontend/components/marketing/legal-page";
import { CONTACT, LEGAL_ENTITY, LEGAL_JURISDICTION, SITE_NAME, mailto } from "@/shared/legal";

export const metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, and protects your data.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        {LEGAL_ENTITY} (&quot;we&quot;, &quot;us&quot;) operates {SITE_NAME} at xicmo.com. This
        Privacy Policy explains what personal data we collect, why we collect it, how we use
        it, and your rights. By using the service you agree to this policy.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">1. Data we collect</h2>
      <ul className="list-disc pl-6">
        <li>
          <strong>Account data:</strong> name, email address, hashed password or OAuth
          identifier, and session tokens.
        </li>
        <li>
          <strong>Workspace data:</strong> company name, website URL, industry, ideal customer
          profile, brand voice settings, content drafts, agent run history, and credit usage.
        </li>
        <li>
          <strong>Integration data:</strong> OAuth tokens and metadata for services you connect
          (Google Search Console, GA4, Reddit, X, LinkedIn, Instagram, GitHub, Stripe).
        </li>
        <li>
          <strong>Usage &amp; diagnostics:</strong> IP address, browser type, pages visited,
          agent execution logs, and error reports — used to operate and improve the product.
        </li>
        <li>
          <strong>Payment data:</strong> billing status and Stripe customer ID. Card numbers are
          handled entirely by Stripe; we never store them.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-semibold">2. How we use data</h2>
      <p>We use your data to:</p>
      <ul className="list-disc pl-6">
        <li>Provide, maintain, and improve {SITE_NAME} and its AI agents.</li>
        <li>Process subscriptions and send transactional email (password reset, billing).</li>
        <li>Run agent workflows on your behalf using the LLM providers and integrations you configure.</li>
        <li>Cache external API results (SEO, social scraping) to reduce cost and latency.</li>
        <li>Detect abuse, enforce our Terms, and comply with legal obligations.</li>
      </ul>
      <p className="mt-4 font-medium">We do not sell your personal data.</p>

      <h2 className="mt-10 text-2xl font-semibold">3. AI &amp; third-party processing</h2>
      <p>
        When you run an agent, your workspace context (website, ICP, voice profile, prompts) may
        be sent to LLM providers (OpenAI, Anthropic, Google Gemini, OpenRouter, etc.) depending on
        which keys are configured. Scraping agents may send public URLs to Apify actors. See our{" "}
        <a href="/subprocessors">Subprocessors</a> page for the full list.
      </p>
      <p>
        You control which integrations are connected. We only request the OAuth scopes shown during
        each connect flow.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">4. Cookies &amp; local storage</h2>
      <p>
        We use essential cookies for authentication and session management, and optional analytics
        cookies only with your consent. See our{" "}
        <a href="/cookies">Cookie Policy</a> for details.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">5. Data retention</h2>
      <p>
        We retain account and workspace data while your account is active. Cached API results are
        stored for up to 24 hours in Redis and longer in our database until overwritten or you
        delete your workspace. You may request deletion at any time.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">6. Your rights</h2>
      <p>
        Depending on your location you may have the right to access, correct, export, or delete
        your personal data, and to object to or restrict certain processing. EU/UK users may
        lodge a complaint with their local supervisory authority.
      </p>
      <p>
        To exercise your rights, use Settings in the app or email{" "}
        <a href={mailto(CONTACT.privacy)} className="text-primary hover:underline">
          {CONTACT.privacy}
        </a>
        . We respond within 30 days.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">7. Security</h2>
      <p>
        We encrypt OAuth tokens at rest, use HTTPS everywhere, and restrict database access. No
        method of transmission over the Internet is 100% secure; we cannot guarantee absolute
        security.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">8. Children</h2>
      <p>
        {SITE_NAME} is not directed at children under 16. We do not knowingly collect data from
        children.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">9. Changes</h2>
      <p>
        We may update this policy. Material changes will be noted on this page with a new
        &quot;Last updated&quot; date.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">10. Contact</h2>
      <p>
        Questions:{" "}
        <a href={mailto(CONTACT.privacy)} className="text-primary hover:underline">
          {CONTACT.privacy}
        </a>
        . {LEGAL_JURISDICTION}
      </p>
    </LegalPage>
  );
}
