import { Link } from "react-router-dom";

const LEGAL_NOTICE_BANNER = (
  <div className="legal-draft-banner">
    ⚠ DRAFT — This is a starting template, not a finished legal document. Have a
    lawyer review and customize it (business name, jurisdiction, actual data
    practices) before relying on it or publishing it to real users.
  </div>
);

export function TermsOfService() {
  return (
    <div className="legal-page">
      <div className="legal-content">
        <Link to="/login" className="back-link">
          ← Back
        </Link>
        <h1>Terms of Service</h1>
        {LEGAL_NOTICE_BANNER}
        <p className="muted">Last updated: [DATE]</p>

        <h2>1. Acceptance of terms</h2>
        <p>
          By creating an account or using [BUSINESS NAME]'s ("we", "us") scheduling, invoicing, and payment
          software (the "Service"), you agree to these Terms of Service. If you do not agree, do not use the
          Service.
        </p>

        <h2>2. Accounts</h2>
        <p>
          You are responsible for maintaining the confidentiality of your account credentials and for all
          activity under your account. Owners are responsible for the conduct of technicians they invite to
          their organization.
        </p>

        <h2>3. Voice recordings and AI processing</h2>
        <p>
          The Service transcribes voice notes you record and uses AI to extract billing information from them.
          Recordings and transcripts may be processed by third-party AI providers (see our Privacy Policy). You
          are responsible for ensuring you have the right to record and process any conversations captured,
          including compliance with any applicable two-party consent laws in your jurisdiction.
        </p>

        <h2>4. Payments</h2>
        <p>
          Payments are processed by Stripe. We do not store your clients' full payment card details. You are
          responsible for the accuracy of invoices you send through the Service.
        </p>

        <h2>5. SMS and email communications</h2>
        <p>
          You are responsible for obtaining proper consent from your clients before sending them SMS messages
          through the Service, and for complying with applicable telemarketing/messaging laws (e.g. TCPA) in
          your jurisdiction.
        </p>

        <h2>6. Termination</h2>
        <p>We may suspend or terminate accounts that violate these terms or misuse the Service.</p>

        <h2>7. Disclaimer of warranties; limitation of liability</h2>
        <p>
          [PLACEHOLDER — standard "AS IS", no warranty, liability cap language belongs here; have counsel draft
          this section specifically, it is highly jurisdiction- and business-dependent.]
        </p>

        <h2>8. Contact</h2>
        <p>Questions about these terms: [SUPPORT EMAIL]</p>
      </div>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <div className="legal-page">
      <div className="legal-content">
        <Link to="/login" className="back-link">
          ← Back
        </Link>
        <h1>Privacy Policy</h1>
        {LEGAL_NOTICE_BANNER}
        <p className="muted">Last updated: [DATE]</p>

        <h2>1. What we collect</h2>
        <ul>
          <li>Account info: name, email, phone, password (hashed, never stored in plain text)</li>
          <li>Client data you enter: names, contact info, addresses, job/invoice history</li>
          <li>Voice recordings and their transcripts, captured on-site by your technicians</li>
          <li>Payment metadata processed via Stripe (we do not store full card numbers)</li>
        </ul>

        <h2>2. How we use it</h2>
        <p>
          To provide the Service: transcribing voice notes (via OpenAI Whisper), extracting billing details (via
          Anthropic's Claude), sending invoices (via Twilio and SendGrid), and processing payments (via Stripe).
        </p>

        <h2>3. Third-party processors</h2>
        <p>
          Voice audio and transcripts are sent to OpenAI and Anthropic for processing. Contact info is sent to
          Twilio (SMS) and SendGrid (email) only when you send an invoice or reminder. Payment details are
          handled entirely by Stripe.
        </p>

        <h2>4. Data retention</h2>
        <p>
          [PLACEHOLDER — decide and state a concrete retention period for voice recordings/transcripts, e.g. "90
          days after the associated invoice is paid," and implement deletion accordingly.]
        </p>

        <h2>5. Your rights</h2>
        <p>
          [PLACEHOLDER — if you serve users in the EU/UK (GDPR) or California (CCPA), this section needs
          specific access/deletion/portability rights language and a real process for handling those requests.]
        </p>

        <h2>6. Security</h2>
        <p>
          Passwords are hashed. Data is transmitted over HTTPS. [Add specifics once your production
          infrastructure — encryption at rest, access controls, backups — is finalized.]
        </p>

        <h2>7. Contact</h2>
        <p>Privacy questions: [SUPPORT EMAIL]</p>
      </div>
    </div>
  );
}
