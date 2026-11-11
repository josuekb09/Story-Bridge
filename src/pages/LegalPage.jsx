// Terms (/terms), Privacy (/privacy) and Community guidelines (/guidelines).
// Owner: Claude (see docs/COLLAB.md). Plain-language texts that describe what the app really does.
// They are not legal advice; have them reviewed before a public launch beyond the hackathon.
import '../styles/components/legal.css';

const UPDATED = '11 November 2026';
const REPO_ISSUES = 'https://github.com/josuekb09/Story-Bridge/issues';

function Contact() {
  return <p>Questions or requests: use the <b>Report</b> button on any post, or open an issue on our <a href={REPO_ISSUES} target="_blank" rel="noreferrer">public project page</a>. Do not post personal details in a public issue; say that you want to be contacted and we will reply.</p>;
}

function Guidelines() {
  return <>
    <p className="legal-lede">Story Bridge is a place to learn from each other's cultures. These rules keep it respectful, accurate and safe. They apply to posts, translations, images, audio, profiles and comments.</p>
    <h2>Share what is yours to share</h2>
    <ul>
      <li>Post your own words, recordings and photos, or material you have permission to share. Credit the person, the source and the licence.</li>
      <li>Some knowledge is sacred, restricted or belongs to a family or community. If a community asks that something not be published, we will take it down.</li>
      <li>Do not post photos or recordings of identifiable people without their consent, and never of children without a parent's or guardian's consent.</li>
    </ul>
    <h2>Be accurate about what you know</h2>
    <ul>
      <li>Say whether you are telling something from lived experience, from family, or from research. Choose the trust label that fits.</li>
      <li>Add sources for facts, dates and history. If you are not sure, say so.</li>
      <li>Machine translations must stay labelled as machine translations until a speaker checks them.</li>
    </ul>
    <h2>Respect people and cultures</h2>
    <ul>
      <li>No hate, harassment or mockery of any people, language, faith or culture.</li>
      <li>No content that encourages violence or puts anyone at risk.</li>
      <li>No private information about others: addresses, phone numbers, identity documents, health details.</li>
      <li>No spam, advertising or misleading links.</li>
    </ul>
    <h2>How moderation works</h2>
    <ul>
      <li>Every new member's first post is reviewed before it becomes public.</li>
      <li>Anyone signed in can report a post. Reports are seen only by the moderator.</li>
      <li>A moderator can hide a post that breaks these rules. The author keeps a private copy and is told why. Serious or repeated abuse can lead to the account being closed.</li>
      <li>If you think a decision was wrong, ask for a review using the contact below.</li>
    </ul>
    <Contact/>
  </>;
}

function Terms() {
  return <>
    <p className="legal-lede">By using Story Bridge you agree to these terms and to the <a href="/guidelines">community guidelines</a>. Story Bridge is a hackathon project and a proof of concept: it is offered as is, without guarantees of availability or backup.</p>
    <h2>Who can use it</h2>
    <p>You must be 18 or older, or have permission from a parent or guardian to create an account.</p>
    <h2>Your content stays yours</h2>
    <ul>
      <li>You keep ownership of what you post. You choose a licence for each post (for example "All rights reserved" or a Creative Commons licence).</li>
      <li>By making a post public you allow Story Bridge to store it, show it and let people read it, under the licence you chose.</li>
      <li>Nothing becomes public until you review and approve it. You can withdraw or delete a post at any time; this stops access through Story Bridge but cannot recall copies others already made.</li>
    </ul>
    <h2>Your responsibilities</h2>
    <ul>
      <li>Only post what you have the right to share, and follow the community guidelines.</li>
      <li>Keep your sign-in method (Google account or email) secure.</li>
    </ul>
    <h2>Our responsibilities and limits</h2>
    <ul>
      <li>We may hide or remove content that breaks the guidelines or the law, and close accounts used for abuse.</li>
      <li>Translations marked as machine or AI drafts may contain mistakes. Cultural information is shared by members and sources; check the sources before relying on it.</li>
      <li>We may change these terms; the date below shows the latest version.</li>
    </ul>
    <Contact/>
  </>;
}

function Privacy() {
  return <>
    <p className="legal-lede">This notice explains, in plain language, what Story Bridge collects, why, who helps us run it, and what you can do. We do not sell data, show ads or use tracking cookies.</p>
    <h2>What we collect</h2>
    <ul>
      <li><b>Account:</b> your email address (or Google sign-in identity), used only to sign you in. It is never shown on public pages.</li>
      <li><b>Profile:</b> display name, country, languages and an optional photo that you choose to add.</li>
      <li><b>Posts:</b> text, translations, images, audio, sources and the choices you make (licence, audience, whether your name is shown), plus a version history of changes.</li>
      <li><b>Moderation:</b> reports you send, and moderation decisions about your posts.</li>
      <li><b>Technical:</b> basic server logs (time, page requested, errors) kept for security and debugging.</li>
    </ul>
    <h2>Who can see what</h2>
    <ul>
      <li>Drafts and private posts: only you (and the moderator, for a first post under review or a reported post).</li>
      <li>Public posts: anyone. By default a post shows your profile name and photo (or your initials if you have no photo). For a sensitive story you can choose "Community member" instead, and your name and photo stay hidden on that post.</li>
      <li>Your photo, audio and image files are stored privately and delivered only according to these rules.</li>
    </ul>
    <h2>Services that process data for us</h2>
    <ul>
      <li><b>Supabase</b>: database, file storage and sign-in.</li>
      <li><b>Render</b>: hosts the website and server.</li>
      <li><b>Google</b>: only if you choose "Continue with Google"; fonts are also loaded from Google Fonts.</li>
      <li><b>OpenAI</b>: only when an author presses "Draft with AI"; the story text is sent to draft a translation and is not saved by Story Bridge unless the author approves it.</li>
      <li><b>Reading in your language:</b> on supported browsers, translation happens on your own device. The "Open in Google Translate" link sends the text to Google only when you click it.</li>
    </ul>
    <h2>On your device</h2>
    <p>We use your browser's storage to keep you signed in and remember your interface language. No advertising or analytics trackers.</p>
    <h2>Your rights</h2>
    <ul>
      <li>See and correct what you posted, and edit your profile, at any time. Ask us for a copy of your data.</li>
      <li>Delete a post, or delete your account from your profile, which removes your profile, posts and files.</li>
      <li>Object to how your information is used, or ask us a question, using the contact below.</li>
      <li>If you are in South Africa, the Protection of Personal Information Act (POPIA) applies, and you may complain to the Information Regulator. People elsewhere have the rights given by their own law.</li>
    </ul>
    <h2>Security and retention</h2>
    <p>Data is protected by access rules in the database (each person can only change their own records), private file storage, encrypted connections and request limits. No system is perfectly secure; if we learn of a breach affecting you, we will tell you. We keep your data while your account exists and delete it when you delete your account.</p>
    <Contact/>
  </>;
}

const PAGES = {
  terms: { title: 'Terms of use', Body: Terms },
  privacy: { title: 'Privacy notice', Body: Privacy },
  guidelines: { title: 'Community guidelines', Body: Guidelines },
};

export default function LegalPage({ type, onBack }) {
  const page = PAGES[type] || PAGES.terms;
  const { Body } = page;
  return <main className="legal-page">
    <button type="button" className="back" onClick={onBack}>← Story Bridge</button>
    <h1>{page.title}</h1>
    <p className="legal-updated">Last updated {UPDATED}</p>
    <nav className="legal-tabs" aria-label="Policies">
      {Object.entries(PAGES).map(([key, value]) => <a key={key} href={`/${key}`} aria-current={key === type ? 'page' : undefined}>{value.title}</a>)}
    </nav>
    <Body/>
  </main>;
}
